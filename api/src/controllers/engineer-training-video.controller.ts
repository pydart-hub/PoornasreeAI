// ── Engineer Training Video Controller ────────────────────────────────────
// Admin CRUD & AI search for private training videos that engineers can query.
// Separate from R&D Videos (which auto-send during troubleshooting).

import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { searchTrainingVideos } from "../services/engineer-training-video.service";

export const DEFAULT_21_TRAINING_VIDEOS = [
  {
    title: "ECOD Channel Selection & Milk Types",
    topic: "channels, channel selection, cow, buffalo, mix, milk channels",
    description: "Configuring Channel 1 (COW FAT 1%-7%), Channel 2 (BUFFALO FAT 7%-15%), and Channel 3 (MIX FAT 1%-15%) with single-key testing.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Testing Modes & Field Collection (4 Modes)",
    topic: "test mode, testing mode, normal mode, remote mode, manual entry, id weight entry",
    description: "Configuring Normal Mode (sample only), Remote Mode (field collection with Farmer ID & weight), Manual Entry, and ID & Weight pre-entry.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Saved Result Edit, Correction & Deletion",
    topic: "result edit, delete result, edit result, correction, analyzer settings",
    description: "How to view results, enable editing under Analyzer Settings > Correction > Edit Enable, and modify test records.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Local Sales Module Configuration",
    topic: "sales, local sales, milk sale facility, rate per liter",
    description: "Setting up local milk sales facility directly in the machine and generating sale slips.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Despatch Facility to BMC & Dairy",
    topic: "despatch, bmc despatch, dairy despatch, despatch id",
    description: "Recording bulk total collection despatch to BMC/Dairy. Navigating Despatch ID entry > Other settings > Farmer settings.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Reports Generation & Export (5 Formats)",
    topic: "reports, summary report, despatch report, collection report, farmer report, sales report",
    description: "Exporting Summary, Despatch, Collection, Farmer, and Sales reports via Printout, USB Pen Drive, RS232 Serial, and Bluetooth.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Rate Chart Configuration & 3-Channel Upload",
    topic: "chart settings, rate chart, chart 3 types, channel 1 chart, channel 2 chart, slab mode",
    description: "Loading Channel 1, 2, and 3 rate charts (max 150KB) via USB Pen Drive, Cloud server, or 5-method built-in chart generator (TS/FAT/SNF slab modes).",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Auto Rate Chart Switching & FAT Boundaries",
    topic: "auto chart, auto fat limit, upper lower rate, rate bounds",
    description: "Setting auto fat limit switching (e.g. results >7% pick Channel 2 rate chart) and upper/lower rate select (e.g. 3%-7% fat file bounds).",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Farmer Details Entry, USB Loading & Bonus",
    topic: "farmer details, farmer file, farmer bonus, common bonus, shift bonus",
    description: "Managing farmer master data, importing farmer lists via USB, setting shift bonus, and calculating annual bonus.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Date, Time & Shift Management",
    topic: "date time, shift settings, shift close, morning evening shift",
    description: "Configuring real-time clock, setting morning/evening shift timings, and performing shift close operations.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Weighing Scale Interfacing & Calibration",
    topic: "weighing scale, scale settings, tare, baud rate, weighing calibration",
    description: "Connecting RS232 digital weighing scales, setting baud rates, continuous mode, and auto-tare settings.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "WiFi, GSM & Cloud Server Configuration",
    topic: "wifi, gsm, gprs, cloud settings, cloud url, auto upload, scanning interval",
    description: "Setting up WiFi SSID/Password, GSM GPRS APN, Cloud server endpoints, and configuring scanning intervals (min 5 minutes).",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Thermal Printer & External Display Setup",
    topic: "printer, display, thermal printer, display settings, page shift, down key",
    description: "Configuring 2-inch/3-inch thermal printers, print headers/footers, and external LED display paging using the down key.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Automatic Cleaning Alerts & Maintenance Cycles",
    topic: "cleaning, cleaning alert, daily cleaning, weekly cleaning, cleaning settings",
    description: "Enabling machine power-on cleaning alerts, warm water rinsing timers, and chemical cleaning cycles.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Password Protection & Access Control",
    topic: "password, access control, pass reset, admin pin, single key testing",
    description: "Setting admin/operator passwords, password-protecting calibration and rate charts, and setting single-key testing mode.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Cleaning Statistics & Calibration Logs",
    topic: "calibration log, cleaning statistics, audit logs, error logs",
    description: "Viewing machine audit reports, past calibration drift logs, and cleaning adherence statistics.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Data Out & 'Ask to Save' Result Prompts",
    topic: "data out, ask to save, save prompt, auto save, rs232 out",
    description: "Enabling 'Ask to Save?' prompt after each sample test under Other Settings > Data Out Settings.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Power Supply & Solar Charger Board Diagnostics",
    topic: "power supply, solar charger, 12v adapter, battery backup, smps",
    description: "Diagnosing DC 12V inputs, solar charge controllers, battery cut-off voltages, and adapter troubleshooting.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Optical Measurement Chamber & Sensor Calibration",
    topic: "optical sensor, zero calibration, water zero, fat zero, sensor calibration",
    description: "Performing distilled water zero calibration, optical sensor cleaning, and temperature compensation offsets.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "VIBRO Stirrer & Ultrasonic Milk Degasser Setup",
    topic: "vibro stirrer, stirrer, degasser, ultrasonic, motor adjustment",
    description: "Connecting VIBRO stirrer, adjusting vibration intensity, bubble elimination timers, and motor driver checks.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "Motherboard Replacement & Firmware Upgrade",
    topic: "mainboard, motherboard, firmware, software update, usb flash, bootloader",
    description: "Motherboard replacement procedure, EEPROM parameter backup, and flashing firmware updates via USB.",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
];

// ── GET /api/admin/training-videos ───────────────────────────────────────
export async function listTrainingVideos(req: Request, res: Response): Promise<void> {
  try {
    const videos = await prisma.engineerTrainingVideo.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ videos });
  } catch (err) {
    console.error("listTrainingVideos error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/admin/training-videos ──────────────────────────────────────
export async function createTrainingVideo(req: Request, res: Response): Promise<void> {
  try {
    const title = (req.body.title as string)?.trim();
    const description = (req.body.description as string)?.trim() || null;
    const youtubeUrl = (req.body.youtubeUrl as string)?.trim();
    const topic = (req.body.topic as string)?.trim();

    if (!title || !youtubeUrl || !topic) {
      res.status(400).json({ error: "Title, YouTube URL, and topic are required" });
      return;
    }

    const video = await prisma.engineerTrainingVideo.create({
      data: { title, description, youtubeUrl, topic },
    });

    res.status(201).json({ video });
  } catch (err) {
    console.error("createTrainingVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/admin/training-videos/:id ─────────────────────────────────
export async function updateTrainingVideo(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const title = (req.body.title as string)?.trim();
    const description = (req.body.description as string)?.trim() || null;
    const youtubeUrl = (req.body.youtubeUrl as string)?.trim();
    const topic = (req.body.topic as string)?.trim();

    if (!title || !youtubeUrl || !topic) {
      res.status(400).json({ error: "Title, YouTube URL, and topic are required" });
      return;
    }

    const existing = await prisma.engineerTrainingVideo.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const video = await prisma.engineerTrainingVideo.update({
      where: { id },
      data: { title, description, youtubeUrl, topic },
    });

    res.json({ video });
  } catch (err) {
    console.error("updateTrainingVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/training-videos/:id ────────────────────────────────
export async function deleteTrainingVideo(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const existing = await prisma.engineerTrainingVideo.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    await prisma.engineerTrainingVideo.delete({ where: { id } });
    res.json({ message: "Video deleted" });
  } catch (err) {
    console.error("deleteTrainingVideo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/admin/training-videos/seed ─────────────────────────────────
export async function seedTrainingVideos(req: Request, res: Response): Promise<void> {
  try {
    const count = await prisma.engineerTrainingVideo.count();
    const overwrite = req.body?.overwrite === true;

    if (count > 0 && !overwrite) {
      const existing = await prisma.engineerTrainingVideo.findMany({
        orderBy: { createdAt: "desc" },
      });
      res.json({
        message: `Training videos already exist (${count} videos found).`,
        count,
        videos: existing,
      });
      return;
    }

    if (overwrite && count > 0) {
      await prisma.engineerTrainingVideo.deleteMany();
    }

    const created = await Promise.all(
      DEFAULT_21_TRAINING_VIDEOS.map((v) =>
        prisma.engineerTrainingVideo.create({
          data: {
            title: v.title,
            topic: v.topic,
            description: v.description,
            youtubeUrl: v.youtubeUrl,
          },
        })
      )
    );

    res.status(201).json({
      message: `Successfully seeded ${created.length} training videos.`,
      count: created.length,
      videos: created,
    });
  } catch (err) {
    console.error("seedTrainingVideos error:", err);
    res.status(500).json({ error: "Failed to seed training videos" });
  }
}

// ── GET /api/training-videos/search ─────────────────────────────────────
export async function searchTrainingVideosHandler(req: Request, res: Response): Promise<void> {
  try {
    const query = String(req.query.q || req.query.query || "").trim();
    if (!query) {
      res.json({ results: [] });
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 5, 10);
    const results = await searchTrainingVideos(query, limit);
    res.json({ query, results });
  } catch (err) {
    console.error("searchTrainingVideosHandler error:", err);
    res.status(500).json({ error: "Search failed" });
  }
}
