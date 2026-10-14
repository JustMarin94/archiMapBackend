import { pool } from "../db.js";

/**
 * Fields that belong directly to the works table.
 */
const WORK_FIELDS = [
  "title",
  "description",
  "typology",
  "city",
  "latitude",
  "longitude",
  "region",
  "year_start",
  "year_end",
  "postal_code",
  "investor",
  "protection_status",
  "address",
  "status",
  "intervention_type",
  "legacy_category",
];

/**
 * Validate year values.
 */
function parseYear(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    const error = new Error(`${fieldName} must be a valid integer`);
    error.status = 400;
    throw error;
  }

  return parsed;
}

/**
 * Validate latitude / longitude.
 */
function parseCoordinate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    const error = new Error(`${fieldName} must be a valid number`);
    error.status = 400;
    throw error;
  }

  return parsed;
}

/**
 * Validate the authors array.
 */
function validateAuthors(authors) {
  if (authors === undefined) {
    return;
  }

  if (!Array.isArray(authors)) {
    const error = new Error("authors must be an array");
    error.status = 400;
    throw error;
  }

  for (const author of authors) {
    if (!author || typeof author !== "object") {
      const error = new Error("Each author must be an object");
      error.status = 400;
      throw error;
    }

    const hasAuthorId = Boolean(author.author_id);
    const hasGroupId = Boolean(author.group_id);

    if (hasAuthorId === hasGroupId) {
      const error = new Error(
        "Each author must contain exactly one of author_id or group_id",
      );
      error.status = 400;
      throw error;
    }
  }
}

/**
 * Validate photos.
 */
function validatePhotos(photos) {
  if (photos === undefined) {
    return;
  }

  if (!Array.isArray(photos)) {
    const error = new Error("photos must be an array");
    error.status = 400;
    throw error;
  }

  for (const photo of photos) {
    if (!photo || typeof photo !== "object") {
      const error = new Error("Each photo must be an object");
      error.status = 400;
      throw error;
    }

    if (!photo.url) {
      const error = new Error("Each photo must contain a url");
      error.status = 400;
      throw error;
    }
  }
}

/**
 * Build the complete work response.
 */
async function getCompleteWork(client, workId) {
  const query = `
    SELECT
      w.*,

      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', p.id,
              'url', p.url,
              'caption', p.caption,
              'alt_text', p.alt_text,
              'position', p.position,
              'created_at', p.created_at
            )
            ORDER BY p.position NULLS LAST, p.created_at
          )
          FROM photos p
          WHERE p.work_id = w.id
        ),
        '[]'::json
      ) AS photos,

      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id',
                CASE
                  WHEN wa.author_id IS NOT NULL THEN a.id
                  ELSE ag.id
                END,

              'type',
                CASE
                  WHEN wa.author_id IS NOT NULL THEN 'author'
                  ELSE 'group'
                END,

              'name',
                CASE
                  WHEN wa.author_id IS NOT NULL THEN a.full_name
                  ELSE ag.name
                END,

              'role', wa.role,

              'image',
                CASE
                  WHEN wa.author_id IS NOT NULL THEN (
                    SELECT ap.url
                    FROM photos ap
                    WHERE ap.author_id = a.id
                    ORDER BY ap.position NULLS LAST, ap.created_at
                    LIMIT 1
                  )
                  ELSE (
                    SELECT gp.url
                    FROM photos gp
                    WHERE gp.group_id = ag.id
                    ORDER BY gp.position NULLS LAST, gp.created_at
                    LIMIT 1
                  )
                END
            )
            ORDER BY
              CASE
                WHEN wa.author_id IS NOT NULL THEN a.full_name
                ELSE ag.name
              END
          )
          FROM work_authors wa
          LEFT JOIN authors a
            ON a.id = wa.author_id
          LEFT JOIN author_groups ag
            ON ag.id = wa.group_id
          WHERE wa.work_id = w.id
        ),
        '[]'::json
      ) AS authors

    FROM works w
    WHERE w.id = $1;
  `;

  const result = await client.query(query, [workId]);

  return result.rows[0] || null;
}

/**
 * GET /works
 */
export async function getWorks(req, res, next) {
  try {
    const { title, typology, awards, author, region, yearStart, yearEnd } =
      req.query;

    const parsedYearStart =
      yearStart !== undefined && yearStart !== ""
        ? parseYear(yearStart, "yearStart")
        : null;

    const parsedYearEnd =
      yearEnd !== undefined && yearEnd !== ""
        ? parseYear(yearEnd, "yearEnd")
        : null;

    const query = `
      SELECT
        w.*,

        COALESCE(
            (
              SELECT json_agg(wa.author_id)
              FROM work_authors wa
              WHERE wa.work_id = w.id
            ),
            '[]'::json
          ) AS author_ids,

        COALESCE(
          json_agg(
            json_build_object(
              'id', p.id,
              'url', p.url,
              'caption', p.caption,
              'alt_text', p.alt_text,
              'position', p.position
            )
            ORDER BY p.position NULLS LAST
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS photos

      FROM works w

      LEFT JOIN photos p
        ON p.work_id = w.id

      WHERE
        ($1::varchar IS NULL
          OR w.title ILIKE '%' || $1::varchar || '%')

        AND ($2::varchar IS NULL
          OR w.typology = $2)

        AND ($3::varchar IS NULL
          OR EXISTS (
            SELECT 1
            FROM work_authors wa
            JOIN authors a
              ON a.id = wa.author_id
            JOIN author_awards aa
              ON aa.author_id = a.id
            WHERE wa.work_id = w.id
              AND aa.title ILIKE '%' || $3::varchar || '%'
          ))

        AND ($4::varchar IS NULL
          OR EXISTS (
            SELECT 1
            FROM work_authors wa
            JOIN authors a
              ON a.id = wa.author_id
            WHERE wa.work_id = w.id
              AND a.full_name = $4
          ))

        AND ($5::varchar IS NULL
          OR w.region = $5)

        AND (
          $6::integer IS NULL
          OR $7::integer IS NULL
          OR (
            w.year_start <= $7
            AND w.year_end >= $6
          )
        )

      GROUP BY w.id

      ORDER BY w.id;
    `;

    const values = [
      title || null,
      typology || null,
      awards || null,
      author || null,
      region || null,
      parsedYearStart,
      parsedYearEnd,
    ];

    const result = await pool.query(query, values);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

export async function getWorkTitles(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT title
      FROM works
      ORDER BY title;
    `);

    res.json(result.rows.map((row) => row.title));
  } catch (error) {
    next(error);
  }
}

export async function getWorkRegions(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT DISTINCT region
      FROM works
      WHERE region IS NOT NULL
      ORDER BY region;
    `);

    res.json(result.rows.map((row) => row.region));
  } catch (error) {
    next(error);
  }
}

export async function getWorkTypology(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT DISTINCT typology
      FROM works
      WHERE typology IS NOT NULL
      ORDER BY typology;
    `);

    res.json(result.rows.map((row) => row.typology));
  } catch (error) {
    next(error);
  }
}

export async function getWorkYearRange(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT
        MIN(year_start) AS min_year,
        MAX(year_end) AS max_year
      FROM works;
    `);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

export async function getWorksByID(req, res, next) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: "Work ID is required",
      });
    }

    const work = await getCompleteWork(pool, id);

    if (!work) {
      return res.status(404).json({
        message: "Work not found",
      });
    }

    res.json(work);
  } catch (error) {
    next(error);
  }
}

export async function createWork(req, res, next) {
  const client = await pool.connect();

  try {
    const body = req.body || {};

    const {
      title,
      description,
      typology,
      city,
      latitude,
      longitude,
      region,
      year_start,
      year_end,
      postal_code,
      investor,
      protection_status,
      address,
      status,
      intervention_type,
      legacy_category,
      photos,
      authors,
    } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        error: "title is required",
      });
    }

    validatePhotos(photos);
    validateAuthors(authors);

    const parsedYearStart = parseYear(year_start, "year_start");
    const parsedYearEnd = parseYear(year_end, "year_end");

    if (
      parsedYearStart !== null &&
      parsedYearEnd !== null &&
      parsedYearStart > parsedYearEnd
    ) {
      return res.status(400).json({
        error: "year_start cannot be greater than year_end",
      });
    }

    const parsedLatitude = parseCoordinate(latitude, "latitude");
    const parsedLongitude = parseCoordinate(longitude, "longitude");

    if (
      parsedLatitude !== null &&
      (parsedLatitude < -90 || parsedLatitude > 90)
    ) {
      return res.status(400).json({
        error: "latitude must be between -90 and 90",
      });
    }

    if (
      parsedLongitude !== null &&
      (parsedLongitude < -180 || parsedLongitude > 180)
    ) {
      return res.status(400).json({
        error: "longitude must be between -180 and 180",
      });
    }

    await client.query("BEGIN");

    const workResult = await client.query(
      `
        INSERT INTO works (
          title,
          description,
          typology,
          city,
          latitude,
          longitude,
          region,
          year_start,
          year_end,
          postal_code,
          investor,
          protection_status,
          address,
          status,
          intervention_type,
          legacy_category
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14,
          $15, $16
        )
        RETURNING *;
      `,
      [
        title.trim(),
        description ?? null,
        typology ?? null,
        city ?? null,
        parsedLatitude,
        parsedLongitude,
        region ?? null,
        parsedYearStart,
        parsedYearEnd,
        postal_code ?? null,
        investor ?? null,
        protection_status ?? null,
        address ?? null,
        status ?? null,
        intervention_type ?? null,
        legacy_category ?? null,
      ],
    );

    const work = workResult.rows[0];
    const workId = work.id;

    if (Array.isArray(photos) && photos.length > 0) {
      for (let index = 0; index < photos.length; index++) {
        const photo = photos[index];

        await client.query(
          `
            INSERT INTO photos (
              url,
              caption,
              alt_text,
              position,
              work_id
            )
            VALUES ($1, $2, $3, $4, $5);
          `,
          [
            photo.url,
            photo.caption ?? null,
            photo.alt_text ?? null,
            photo.position ?? index,
            workId,
          ],
        );
      }
    }

    if (Array.isArray(authors) && authors.length > 0) {
      for (const author of authors) {
        await client.query(
          `
            INSERT INTO work_authors (
              work_id,
              author_id,
              group_id,
              role
            )
            VALUES ($1, $2, $3, $4);
          `,
          [
            workId,
            author.author_id ?? null,
            author.group_id ?? null,
            author.role ?? null,
          ],
        );
      }
    }

    const completeWork = await getCompleteWork(client, workId);

    await client.query("COMMIT");

    res.status(201).json(completeWork);
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({
        error: "A work with these values already exists",
        detail: error.detail,
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        error:
          "One of the referenced authors, groups, or related records does not exist",
        detail: error.detail,
      });
    }

    next(error);
  } finally {
    client.release();
  }
}

export async function updateWork(req, res, next) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const body = req.body || {};

    if (!id) {
      return res.status(400).json({
        error: "Work ID is required",
      });
    }

    validatePhotos(body.photos);
    validateAuthors(body.authors);

    const parsedYearStart =
      body.year_start !== undefined
        ? parseYear(body.year_start, "year_start")
        : undefined;

    const parsedYearEnd =
      body.year_end !== undefined
        ? parseYear(body.year_end, "year_end")
        : undefined;

    if (
      parsedYearStart !== undefined &&
      parsedYearEnd !== undefined &&
      parsedYearStart !== null &&
      parsedYearEnd !== null &&
      parsedYearStart > parsedYearEnd
    ) {
      return res.status(400).json({
        error: "year_start cannot be greater than year_end",
      });
    }

    const parsedLatitude =
      body.latitude !== undefined
        ? parseCoordinate(body.latitude, "latitude")
        : undefined;

    const parsedLongitude =
      body.longitude !== undefined
        ? parseCoordinate(body.longitude, "longitude")
        : undefined;

    if (
      parsedLatitude !== undefined &&
      parsedLatitude !== null &&
      (parsedLatitude < -90 || parsedLatitude > 90)
    ) {
      return res.status(400).json({
        error: "latitude must be between -90 and 90",
      });
    }

    if (
      parsedLongitude !== undefined &&
      parsedLongitude !== null &&
      (parsedLongitude < -180 || parsedLongitude > 180)
    ) {
      return res.status(400).json({
        error: "longitude must be between -180 and 180",
      });
    }

    await client.query("BEGIN");

    const existing = await client.query(
      `
        SELECT id
        FROM works
        WHERE id = $1
        FOR UPDATE;
      `,
      [id],
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Work not found",
      });
    }

    const updateValues = [];
    const updateParts = [];

    const fieldValues = {
      title: body.title,
      description: body.description,
      typology: body.typology,
      city: body.city,
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      region: body.region,
      year_start: parsedYearStart,
      year_end: parsedYearEnd,
      postal_code: body.postal_code,
      investor: body.investor,
      protection_status: body.protection_status,
      address: body.address,
      status: body.status,
      intervention_type: body.intervention_type,
      legacy_category: body.legacy_category,
    };

    for (const field of WORK_FIELDS) {
      if (fieldValues[field] !== undefined) {
        updateValues.push(fieldValues[field]);
        updateParts.push(`"${field}" = $${updateValues.length}`);
      }
    }

    if (updateParts.length > 0) {
      updateParts.push("updated_at = NOW()");

      updateValues.push(id);

      await client.query(
        `
          UPDATE works
          SET ${updateParts.join(", ")}
          WHERE id = $${updateValues.length};
        `,
        updateValues,
      );
    }

    if (body.photos !== undefined) {
      await client.query(
        `
          DELETE FROM photos
          WHERE work_id = $1;
        `,
        [id],
      );

      if (body.photos.length > 0) {
        for (let index = 0; index < body.photos.length; index++) {
          const photo = body.photos[index];

          await client.query(
            `
              INSERT INTO photos (
                url,
                caption,
                alt_text,
                position,
                work_id
              )
              VALUES ($1, $2, $3, $4, $5);
            `,
            [
              photo.url,
              photo.caption ?? null,
              photo.alt_text ?? null,
              photo.position ?? index,
              id,
            ],
          );
        }
      }
    }

    if (body.authors !== undefined) {
      await client.query(
        `
          DELETE FROM work_authors
          WHERE work_id = $1;
        `,
        [id],
      );

      if (body.authors.length > 0) {
        for (const author of body.authors) {
          await client.query(
            `
              INSERT INTO work_authors (
                work_id,
                author_id,
                group_id,
                role
              )
              VALUES ($1, $2, $3, $4);
            `,
            [
              id,
              author.author_id ?? null,
              author.group_id ?? null,
              author.role ?? null,
            ],
          );
        }
      }
    }

    const updatedWork = await getCompleteWork(client, id);

    await client.query("COMMIT");

    res.json(updatedWork);
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Duplicate work author/group relationship",
        detail: error.detail,
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        error:
          "One of the referenced authors, groups, or related records does not exist",
        detail: error.detail,
      });
    }

    next(error);
  } finally {
    client.release();
  }
}

export async function deleteWork(req, res, next) {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: "Work ID is required",
      });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `
        DELETE FROM works
        WHERE id = $1
        RETURNING id;
      `,
      [id],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Work not found",
      });
    }

    await client.query("COMMIT");

    res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}
