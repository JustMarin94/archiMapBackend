import express from "express";

import {
  getWorks,
  getWorkTitles,
  getWorkRegions,
  getWorkTypology,
  getWorkYearRange,
  getWorksByID,
  createWork,
  updateWork,
  deleteWork,
} from "../controllers/works.controller.js";

const router = express.Router();

// --- Collection & Metadata Routes (Must come BEFORE /:id) ---
router.get("/", getWorks); // Fix: changed from "/works" to "/" if mounted on /works
router.get("/titles", getWorkTitles);
router.get("/regions", getWorkRegions);
router.get("/typology", getWorkTypology);
router.get("/year-range", getWorkYearRange);

// --- Single Resource Routes ---
router.get("/:id", getWorksByID);

// --- Mutation Routes ---
router.post("/", createWork); // Fix: changed from "/works" to "/"
router.put("/:id", updateWork);
router.delete("/:id", deleteWork);

export default router;
