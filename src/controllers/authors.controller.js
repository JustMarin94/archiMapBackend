import { pool } from "../db.js";

export async function getAuthors(req, res, next) {
  try {
    const { full_name, title, typology, awards, region, yearStart, yearEnd } =
      req.query;

    // Safely parse and validate years to prevent invalid integer queries
    const parsedYearStart = yearStart ? parseInt(yearStart, 10) : null;
    const parsedYearEnd = yearEnd ? parseInt(yearEnd, 10) : null;

    if (
      (yearStart && isNaN(parsedYearStart)) ||
      (yearEnd && isNaN(parsedYearEnd))
    ) {
      return res
        .status(400)
        .json({ error: "yearStart and yearEnd must be valid numbers" });
    }

    const query = `
      SELECT 
        a.*,
        p.id AS image_id,
        p.url AS photo_url,
        p.caption,
        p.alt_text,
        p.position,
        p.created_at AS image_created_at
      FROM authors a
      LEFT JOIN photos p ON p.author_id = a.id
      WHERE 
        ($1::varchar IS NULL OR a.full_name ILIKE '%' || $1::varchar || '%')
        AND ($4::varchar IS NULL OR a.awards ILIKE '%' || $4::varchar || '%')
        AND (
          -- If no work/region/year filters are passed, don't force an EXISTS match, 
          -- allowing authors without works or pictures to show up.
          ($2::varchar IS NULL AND $3::varchar IS NULL AND $5::varchar IS NULL AND $6::integer IS NULL AND $7::integer IS NULL)
          OR EXISTS (
            SELECT 1 
            FROM work_authors wa 
            JOIN works w ON w.id = wa.work_id 
            LEFT JOIN author_group_members agm 
              ON agm.group_id = wa.group_id AND agm.author_id = a.id 
            WHERE 
              (wa.author_id = a.id OR agm.author_id IS NOT NULL)
              AND ($2::varchar IS NULL OR w.title ILIKE '%' || $2::varchar || '%')
              AND ($3::varchar IS NULL OR w.typology = $3)
              AND ($5::varchar IS NULL OR w.region = $5)
              AND (
                $6::integer IS NULL 
                OR $7::integer IS NULL 
                OR (w.year_start <= $7 AND w.year_end >= $6)
              )
          )
        )
      ORDER BY a.full_name, p.position;
    `;

    const values = [
      full_name || null,
      title || null,
      typology || null,
      awards || null,
      region || null,
      parsedYearStart,
      parsedYearEnd,
    ];

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    // Pass error to Express error-handling middleware
    next(error);
  }
}

export async function getAuthorsByID(req, res, next) {
  try {
    const { id } = req.params;

    // Optional: Validate if ID is a valid integer or UUID depending on your DB schema
    if (!id) {
      return res.status(400).json({ error: "Author ID is required" });
    }

    const query = `
      SELECT 
        a.*,
        p.id AS image_id,
        p.url AS photo_url,
        p.caption,
        p.alt_text,
        p.position,
        p.created_at AS image_created_at
      FROM authors a
      LEFT JOIN photos p ON p.author_id = a.id
      WHERE a.id = $1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Author not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

export async function getAuthorsFullNames(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT full_name 
      FROM authors 
      ORDER BY full_name;
    `);
    res.json(result.rows.map((row) => row.full_name));
  } catch (error) {
    next(error);
  }
}

export async function getAuthorsAwards(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT DISTINCT awards 
      FROM authors 
      ORDER BY awards;
    `);
    res.json(result.rows.map((row) => row.awards));
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new author
 */
export async function createAuthor(req, res, next) {
  try {
    const {
      full_name,
      birth_year,
      death_year,
      education,
      awards,
      description,
    } = req.body;

    // Validate required fields based on NOT NULL constraints
    if (!full_name) {
      return res.status(400).json({ error: "full_name is required" });
    }

    const query = `
      INSERT INTO authors (
        full_name, 
        birth_year, 
        death_year, 
        education, 
        awards, 
        description
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const values = [
      full_name,
      birth_year || null,
      death_year || null,
      education || null,
      awards || null,
      description || null,
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * Update an existing author by ID
 */
export async function updateAuthor(req, res, next) {
  try {
    const { id } = req.params;
    const {
      full_name,
      birth_year,
      death_year,
      education,
      awards,
      description,
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Author ID is required" });
    }

    // Check if the author exists first
    const checkExist = await pool.query(
      `SELECT id FROM authors WHERE id = $1`,
      [id],
    );
    if (checkExist.rows.length === 0) {
      return res.status(404).json({ message: "Author not found" });
    }

    const query = `
      UPDATE authors 
      SET 
        full_name = COALESCE($1, full_name),
        birth_year = COALESCE($2, birth_year),
        death_year = COALESCE($3, death_year),
        education = COALESCE($4, education),
        awards = COALESCE($5, awards),
        description = COALESCE($6, description),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *;
    `;

    const values = [
      full_name !== undefined ? full_name : null,
      birth_year !== undefined ? birth_year : null,
      death_year !== undefined ? death_year : null,
      education !== undefined ? education : null,
      awards !== undefined ? awards : null,
      description !== undefined ? description : null,
      id,
    ];

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete an author by ID
 * (Note: Foreign keys with ON DELETE CASCADE will handle related work_authors,
 * author_group_members, and author photos automatically)
 */
export async function deleteAuthor(req, res, next) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Author ID is required" });
    }

    const result = await pool.query(
      `DELETE FROM authors WHERE id = $1 RETURNING id;`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Author not found" });
    }

    res.json({ message: "Author successfully deleted", id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
}
