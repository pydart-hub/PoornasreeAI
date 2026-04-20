import { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import { env } from "../config/env";

const SALT_ROUNDS = 12;

// ── Register ─────────────────────────────────────
export async function registerUser(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName) {
      res.status(400).json({ error: "Missing required fields: email, password, firstName" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName?.trim() ?? null,
        role: "customer",
      },
    });

    const { passwordHash: _, ...safeUser } = user;
    res.status(201).json({ user: safeUser });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── Login ────────────────────────────────────────
export async function loginUser(req: Request, res: Response): Promise<void> {
  console.log(`[auth] Login attempt — email: ${req.body?.email ?? "(missing)"}  origin: ${req.headers.origin ?? "(none)"}`);
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Support lookup by email OR by firstName (simple username shortcut)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { firstName: { equals: email.trim(), mode: "insensitive" } },
        ],
      },
    });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, pincodeId: user.pincodeId ?? null },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAMESITE,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const { passwordHash: _, ...safeUser } = user;
    res.status(200).json({ message: "Login successful", user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── Me (session check) ──────────────────────────
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const token = req.cookies?.token;
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as {
      userId: string;
      role: string;
    };

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const { passwordHash: _, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (err) {
    console.error("Auth /me error:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Logout ───────────────────────────────────────
export async function logoutUser(_req: Request, res: Response): Promise<void> {
  res.clearCookie("token", {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
  });
  res.json({ message: "Logged out" });
}

// ── Set Password (engineer self-onboarding) ──────
// Called with a one-time token sent via WhatsApp. No authentication required.
export async function setPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ error: "token and password are required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await prisma.user.findFirst({
      where: {
        setPasswordToken: tokenHash,
        setPasswordTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ error: "Invalid or expired link. Please ask your manager to resend." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        setPasswordToken: null,
        setPasswordTokenExpiry: null,
      },
    });

    res.status(200).json({ message: "Password set successfully. You can now log in." });
  } catch (err) {
    console.error("setPassword error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── Update Profile (self-service: email + password) ──
export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { email, currentPassword, newPassword } = req.body;
    const hasEmailChange = typeof email === "string" && email.trim().length > 0;
    const hasPasswordChange = typeof newPassword === "string" && newPassword.length > 0;

    if (!hasEmailChange && !hasPasswordChange) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const updateData: Record<string, unknown> = {};

    if (hasPasswordChange) {
      if (!currentPassword) {
        res.status(400).json({ error: "Current password is required to set a new password" });
        return;
      }
      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        res.status(400).json({ error: "Current password is incorrect" });
        return;
      }
      if (newPassword.length < 8) {
        res.status(400).json({ error: "New password must be at least 8 characters" });
        return;
      }
      updateData.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }

    if (hasEmailChange) {
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail !== user.email) {
        const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
          res.status(409).json({ error: "This email is already in use" });
          return;
        }
        updateData.email = normalizedEmail;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Re-issue JWT so the session reflects the updated user
    const newToken = jwt.sign(
      { userId: updated.id, role: updated.role, pincodeId: updated.pincodeId ?? null },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
    );
    res.cookie("token", newToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAMESITE,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const { passwordHash: _, ...safeUser } = updated;
    res.json({ message: "Profile updated successfully", user: safeUser });
  } catch (err) {
    console.error("updateProfile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}