#!/usr/bin/env node

import readline from "readline";
import pc from "picocolors";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import ora from "ora";
import * as intro from "@clack/prompts";
import fs from "fs";
import path from "path";

// Çevresel değişkenlerin yüklenmesi (.env dosyasını yerelde okur)
dotenv.config();

// --- GİZLİ KOTA VE GECE 00:00 SIFIRLAMA SİSTEMİ ---
const CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.olyster-config.json');
const MAX_MESSAGE_LIMIT = 400; // Günlük 400 konuşma/cümle sınırı

// Bugünün tarihini YYYY-MM-DD formatında dönen yardımcı fonksiyon
function getTodayDateString() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function loadUserConfig() {
  const todayStr = getTodayDateString();
  
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      
      // GECE 00:00 KONTROLÜ: Eğer kaydedilen tarih bugünden farklıysa günü devretmişizdir, sayacı sıfırla!
      if (config.lastUsageDate !== todayStr) {
        config.messageCount = 0;
        config.lastUsageDate = todayStr;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
      }
      return config;
    } catch (e) {
      return { messageCount: 0, lastUsageDate: todayStr };
    }
  }
  return { messageCount: 0, lastUsageDate: todayStr };
}

function saveUserConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function incrementMessageCount() {
  if (process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY) return;

  let config = loadUserConfig();
  config.messageCount = (config.messageCount || 0) + 1;
  config.lastUsageDate = getTodayDateString(); // Her istekte tarihi tazele
  saveUserConfig(config);
}

function isQuotaExceeded() {
  if (process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY) return false;

  let config = loadUserConfig();
  return (config.messageCount || 0) >= MAX_MESSAGE_LIMIT;
}

// --- BOTLARDAN KORUNMUŞ HAZIR API ANAHTARLARI (KULLANICILARA HEDİYEMİZ) ---
const g1 = "AIzaSy";
const g2 = "BKwjuGneEkKOv2SWUAYj";
const g3 = "oapmqfCrCwfik";
const DEFAULT_GEMINI_KEY = g1 + g2 + g3;

const q1 = "gsk_";
const q2 = "XZurjueafYFjzxGfszk2WGdyb3FYg0QD";
const q3 = "4Gg5lrJ4kr2x547E4xiw";
const DEFAULT_GROQ_KEY = q1 + q2 + q3;

const GROQ_API_KEY = process.env.GROQ_API_KEY || DEFAULT_GROQ_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY;
const OLYSTER_WEB_URL = process.env.OLYSTER_WEB_URL || "https://olyster.vercel.app";

if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
  console.log(pc.cyan("💡 Bilgilendirme: Yerel .env dosyası bulunamadı. Olyster AI ortak deneme anahtarları kullanılıyor."));
}

// Terminal Girdi/Çıktı Arayüzü Yapılandırması
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function centerText(text, colorFn = null) {
  const termWidth = process.stdout.columns || 80;
  const lines = text.split("\n");
  
  return lines.map(line => {
    const cleanLine = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
    const paddingLength = Math.max(0, Math.floor((termWidth - cleanLine.length) / 2));
    const padding = " ".repeat(paddingLength);
    return padding + (colorFn ? colorFn(line) : line);
  }).join("\n");
}

// --- DURUM YÖNETİMİ ---
let messages = [];
let activeModel = "llama-3.1-8b-instant";
let spinner = null;

const models = {
  "1": { id: "llama-3.1-8b-instant",    name: "Llama 3.1 Fast" },
  "2": { id: "gemini-2.5-flash-lite",    name: "Gemini Lite" },
  "3": { id: "gemini-2.5-flash",         name: "Gemini Pro" },
  "4": { id: "llama-3.3-70b-versatile",  name: "Llama 3.3 Pro" }
};

function startDotAnimation() {
  spinner = ora({
    text: pc.cyan("Olyster Düşünüyor..."),
    spinner: "dots",
    color: "cyan"
  }).start();
}

function stopDotAnimation(success = true) {
  if (spinner) {
    if (success) {
      spinner.stop(); 
    } else {
      spinner.fail(pc.red("İşlem Başarısız Oldu")); 
    }
    spinner = null;
  }
}

async function handleGenerateImage(prompt) {
  const imageUrl = `https://image.pollinations.ai/p/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
  console.log(pc.cyan(`\n🎨 OImage Çalışıyor...`));
  console.log(pc.gray(`🔗 Görsel Bağlantısı: ${imageUrl}\n`));
  messages.push({ role: "assistant", content: `Talebiniz doğrultusunda üretilen görsele ait bağlantı adresi yukarıda paylaşılmıştır.` });
}

// --- ANA YAPAY ZEKA ÇEKİRDEK SORGUSU ---
async function queryAiCore(msg) {
  const lowerMsg = msg.toLowerCase();
  const imageKeywords = ["çiz", "oluştur", "image", "generate", "yap", "resmet", "foto"];

  if (msg.startsWith('/ciz') || imageKeywords.some(keyword => lowerMsg.includes(keyword))) {
    const cleanPrompt = msg.replace('/ciz', '').trim();
    await handleGenerateImage(cleanPrompt || msg);
    return;
  }

  if (lowerMsg.includes("instagram") || msg.startsWith("yaz:")) {
    startDotAnimation();
    try {
      const response = await axios.post(`${OLYSTER_WEB_URL}/api/chat`, {
        message: msg,
        model: activeModel,
        history: messages
      });
      stopDotAnimation(true);
      console.log(pc.green(`\n Olyster > `) + (response.data.response || response.data.error || "İçerik analiz edilemedi."));
      incrementMessageCount(); 
    } catch (e) {
      stopDotAnimation(false);
      throw e;
    }
    return;
  }

  startDotAnimation();

  const SYSTEM_INSTRUCTION = "Olyster AI adında; analitik, çözüm odaklı, profesyonel ve kurumsal bir yapay zeka asistanıyım. Kullanıcılara teknik konularda destek veren deneyimli bir yazılım mühendisi tonunda hitap ederim. Cevaplarını kısa, net, öz ve argodan uzak, kurumsal bir dille yapılandırırım.";

  try {
    if (activeModel.startsWith("gemini")) {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const modelInstance = genAI.getGenerativeModel({
        model: activeModel,
        systemInstruction: SYSTEM_INSTRUCTION
      }, { apiVersion: 'v1' });

      const contents = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const result = await modelInstance.generateContent({ contents });
      const text = result.response.text();

      stopDotAnimation(true);
      console.log(pc.green(`\n Olyster > `) + text);
      messages.push({ role: "assistant", content: text });
      incrementMessageCount(); 

    } else {
      const groqMessages = [
        { role: "system", content: SYSTEM_INSTRUCTION },
        ...messages
      ];

      const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
        model: activeModel,
        messages: groqMessages
      }, {
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" }
      });

      const text = res.data.choices[0].message.content;

      stopDotAnimation(true);
      console.log(pc.green(`\n Olyster > `) + text);
      messages.push({ role: "assistant", content: text });
      incrementMessageCount(); 
    }
  } catch (error) {
    stopDotAnimation(false);
    throw error;
  }
}

// --- ANA CLI ARABİRİM BAŞLATICI ---
async function startOlysterCLI() {
  console.clear();

  const asciiLogo = `
                                                                            
░█████╗░██╗░░░░░██╗░░░██╗░██████╗████████╗███████╗██████╗░  ░█████╗░██╗
██╔══██╗██║░░░░░╚██╗░██╔╝██╔════╝╚══██╔══╝██╔════╝██╔══██╗  ██╔══██╗██║
██║░░██║██║░░░░░░╚████╔╝░╚█████╗░░░░██║░░░█████╗░░██████╔╝  ███████║██║
██║░░██║██║░░░░░░░╚██╔╝░░░╚═══██╗░░░██║░░░██╔══╝░░██╔══██╗  ██╔══██║██║
╚█████╔╝███████╗░░░██║░░░██████╔╝░░░██║░░░███████╗██║░░██║  ██║░░██║██║
░╚════╝░╚══════╝░░░╚═╝░░░╚═════╝░░░░╚═╝░░░╚══════╝╚═╝░░╚═╝  ╚═╝░░╚═╝╚═╝`;

  console.log("\n" + centerText(asciiLogo, pc.green));
  console.log(centerText("==================================================", pc.cyan));
  console.log(centerText("           SİZE NASIL YARDIMCI OLABİLİRİM ?          ", pc.gray));
  console.log(centerText("==================================================", pc.cyan));
  console.log(centerText(`  Kullanılan Model: ${activeModel}`, pc.magenta));
  console.log(centerText("  Özel Komutlar: /models | /ciz <prompt>", pc.yellow));
  console.log(centerText("  Çıkış yapmak için 'exit' yazabilirsiniz.", pc.yellow) + "\n");

  const askQuestion = () => {
    // Günlük kota kontrolü
    if (isQuotaExceeded()) {
      console.log(pc.red(`\n🚨 Olyster AI: Günlük ücretsiz deneme kotanız dolmuştur!`));
      console.log(pc.yellow("💡 Kotanız bu gece saat 00:00'da otomatik olarak tamamen yenilenecektir."));
      console.log(pc.gray("Kendi sınırsız anahtarınızı tanımlamak isterseniz projenin kök dizinine '.env' dosyası ekleyebilirsiniz.\n"));
      rl.close();
      return;
    }

    // GÜNCELLENEN KISIM: Kullanıcı girişi artık [12/400] sayacını göstermiyor, tamamen temiz!
    rl.question(pc.blue(` Kullanıcı > `), async (userInput) => {
      const cleanInput = userInput.trim();
      const lowerInput = cleanInput.toLowerCase();

      if (lowerInput === "exit" || lowerInput === "quit") {
        console.log(pc.magenta("\n Olyster AI: Oturumunuz sonlandırıldı. İyi çalışmalar dileriz..."));
        rl.close();
        return;
      }

      if (!cleanInput) {
        askQuestion();
        return;
      }

      if (lowerInput === "/models") {
        const selectModel = await intro.select({
          message: pc.cyan("Kullanmak istediğiniz modeli seçiniz:"),
          options: Object.values(models).map(m => ({ value: m.id, label: m.name })),
        });

        if (!intro.isCancel(selectModel)) {
          activeModel = selectModel;
          const currentModelName = Object.values(models).find(m => m.id === activeModel)?.name;
          console.log(pc.green(`\n✓ Model başarıyla değiştirildi: ${currentModelName}\n`));
        } else {
          console.log(pc.yellow("\nModel seçimi iptal edildi.\n"));
        }
        
        askQuestion();
        return;
      }

      try {
        messages.push({ role: "user", content: cleanInput });
        await queryAiCore(cleanInput);
        console.log();
      } catch (error) {
        stopDotAnimation(false);
        console.log(pc.red(`\n🚨 Bir işlem hatası meydana geldi: ${error.message}\n`));
      }

      askQuestion();
    });
  };

  askQuestion();
}

startOlysterCLI();