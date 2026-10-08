import { Router } from "express";
import {
  getAuthors,
  getAuthorsByID,
  getAuthorsFullNames,
  getAuthorsAwards,
  createAuthor,
  updateAuthor,
  deleteAuthor,
} from "../controllers/authors.controller.js";

const router = Router();

// --- Metadata & Filter Routes ---
router.get("/names", getAuthorsFullNames);
router.get("/awards", getAuthorsAwards);

// --- Collection Routes ---
router.get("/", getAuthors);

// --- Single Resource Routes ---
router.get("/:id", getAuthorsByID);
router.post("/", createAuthor);
router.put("/:id", updateAuthor);
router.delete("/:id", deleteAuthor);

export default router;
