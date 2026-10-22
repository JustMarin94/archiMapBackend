import prisma from "../db/prisma.js";
import crypto from "crypto";

/**
 * Helper to hash passwords if you store them hashed (using scrypt or similar,
 * or you can skip hashing if your DB manual entries are plain text).
 */
function verifyPassword(suppliedPassword, storedPassword) {
  // If you store plain text passwords in the DB for testing, use:
  // return suppliedPassword === storedPassword;

  // Example using Node crypto scrypt if hashed:
  const [salt, key] = storedPassword.split(":");
  if (!salt || !key) return suppliedPassword === storedPassword; // fallback
  const hashedBuffer = crypto.scryptSync(suppliedPassword, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(key, "hex"), hashedBuffer);
}

/**
 * POST /auth/login
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.users.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check password (supports plain text or basic comparison if preferred)
    const isValid =
      user.password === password || verifyPassword(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Return user details and role (you can attach a JWT token here later if needed)
    return res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
}
