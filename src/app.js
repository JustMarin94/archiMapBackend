import "dotenv/config";
import express from "express";
import cors from "cors";
import worksRoutes from "./routes/works.routes.js";
import authorsRoutes from "./routes/authors.routes.js";
import prisma from "./db/prisma.js";

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://3994-93-136-134-189.ngrok-free.app",
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

app.get("/prisma-test", async (req, res) => {
  try {
    const author = await prisma.authors.findFirst({
      select: {
        id: true,
        full_name: true,
      },
    });

    res.json({
      success: true,
      message: "Prisma connected successfully",
      author,
    });
  } catch (error) {
    console.error("Prisma test failed:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.listen(3000, () => {
  console.log("API running on http://localhost:3000");
});
