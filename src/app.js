import "dotenv/config";
import express from "express";
import cors from "cors";
import worksRoutes from "./routes/works.routes.js";
import authorsRoutes from "./routes/authors.routes.js";
import authRoutes from "./routes/auth.routes.js";
import prisma from "./db/prisma.js";

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://637a-2a05-4f44-30d-9100-8183-7b2d-d5b5-14bc.ngrok-free.app",
    ],
  }),
);

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err);

  // Do not leak error details in production
  const responseMessage =
    process.env.NODE_ENV === "production"
      ? { error: "Internal Server Error" }
      : { error: err.message, stack: err.stack };

  res.status(500).json(responseMessage);
});

app.use(express.json());

app.use("/works", worksRoutes);
app.use("/authors", authorsRoutes);
app.use("/auth", authRoutes);

app.listen(3000, () => {
  console.log("API running on http://localhost:3000");
});
