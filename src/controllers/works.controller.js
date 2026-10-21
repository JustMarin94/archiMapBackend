import prisma from "../db/prisma.js";

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
 * Build the complete work response with relations.
 */
export async function getCompleteWork(workId) {
  const work = await prisma.works.findUnique({
    where: { id: workId },
    include: {
      photos: {
        orderBy: [
          { position: { sort: "asc", nulls: "last" } },
          { created_at: "asc" },
        ],
      },
      work_authors: {
        include: {
          authors: {
            include: {
              photos: {
                orderBy: [
                  { position: { sort: "asc", nulls: "last" } },
                  { created_at: "asc" },
                ],
                take: 1,
              },
            },
          },
          author_groups: {
            include: {
              photos: {
                orderBy: [
                  { position: { sort: "asc", nulls: "last" } },
                  { created_at: "asc" },
                ],
                take: 1,
              },
            },
          },
        },
        orderBy: [{ authors: { full_name: "asc" } }],
      },
    },
  });

  if (!work) return null;

  const formattedAuthors = work.work_authors.map((wa) => {
    const isAuthor = wa.author_id !== null;
    const entity = isAuthor ? wa.authors : wa.author_groups;

    return {
      id: entity?.id,
      type: isAuthor ? "author" : "group",
      name: isAuthor ? wa.authors?.full_name : wa.author_groups?.name,
      role: wa.role,
      image: entity?.photos?.[0]?.url || null,
    };
  });

  return {
    ...work,
    photos: work.photos,
    authors: formattedAuthors,
  };
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

    const where = {};

    if (title) {
      where.title = { contains: title, mode: "insensitive" };
    }

    if (typology) {
      where.typology = typology;
    }

    if (region) {
      where.region = region;
    }

    if (author) {
      where.work_authors = {
        some: {
          authors: {
            full_name: author,
          },
        },
      };
    }

    if (awards) {
      where.work_authors = {
        ...where.work_authors,
        some: {
          ...where.work_authors?.some,
          authors: {
            ...where.work_authors?.some?.authors,
            author_awards: {
              some: {
                title: { contains: awards, mode: "insensitive" },
              },
            },
          },
        },
      };
    }

    if (parsedYearStart !== null && parsedYearEnd !== null) {
      where.year_start = { lte: parsedYearEnd };
      where.year_end = { gte: parsedYearStart };
    }

    const works = await prisma.works.findMany({
      where,
      include: {
        photos: {
          orderBy: [{ position: { sort: "asc", nulls: "last" } }],
        },
        work_authors: {
          select: {
            author_id: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    const result = works.map((w) => ({
      ...w,
      author_ids: w.work_authors.map((wa) => wa.author_id).filter(Boolean),
      work_authors: undefined,
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getWorkTitles(req, res, next) {
  try {
    const works = await prisma.works.findMany({
      select: { title: true },
      orderBy: { title: "asc" },
    });

    res.json(works.map((work) => work.title));
  } catch (error) {
    next(error);
  }
}

export async function getWorkRegions(req, res, next) {
  try {
    const works = await prisma.works.findMany({
      where: {
        AND: [{ region: { not: "" } }, { region: { not: null } }],
      },
      select: { region: true },
      distinct: ["region"],
      orderBy: { region: "asc" },
    });

    res.json(works.map((work) => work.region));
  } catch (error) {
    next(error);
  }
}

export async function getWorkTypology(req, res, next) {
  try {
    const works = await prisma.works.findMany({
      where: {
        AND: [{ typology: { not: "" } }, { typology: { not: null } }],
      },
      select: { typology: true },
      distinct: ["typology"],
      orderBy: { typology: "asc" },
    });

    res.json(works.map((work) => work.typology));
  } catch (error) {
    next(error);
  }
}

export async function getWorkYearRange(req, res, next) {
  try {
    const result = await prisma.works.aggregate({
      _min: { year_start: true },
      _max: { year_end: true },
    });

    res.json({
      min_year: result._min.year_start,
      max_year: result._max.year_end,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /works/:id
 * Reuses getCompleteWork to return the fully populated object with relations.
 */
export async function getWorksByID(req, res, next) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Work ID is required" });
    }

    const work = await getCompleteWork(id);

    if (!work) {
      return res.status(404).json({ message: "Work not found" });
    }

    res.json(work);
  } catch (error) {
    next(error);
  }
}

export async function createWork(req, res, next) {
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
      return res.status(400).json({ error: "title is required" });
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
      return res
        .status(400)
        .json({ error: "latitude must be between -90 and 90" });
    }

    if (
      parsedLongitude !== null &&
      (parsedLongitude < -180 || parsedLongitude > 180)
    ) {
      return res
        .status(400)
        .json({ error: "longitude must be between -180 and 180" });
    }

    const work = await prisma.$transaction(async (tx) => {
      const newWork = await tx.works.create({
        data: {
          title: title.trim(),
          description: description ?? null,
          typology: typology ?? null,
          city: city ?? null,
          latitude: parsedLatitude,
          longitude: parsedLongitude,
          region: region ?? null,
          year_start: parsedYearStart,
          year_end: parsedYearEnd,
          postal_code: postal_code ?? null,
          investor: investor ?? null,
          protection_status: protection_status ?? null,
          address: address ?? null,
          status: status ?? null,
          intervention_type: intervention_type ?? null,
          legacy_category: legacy_category ?? null,
        },
      });

      if (Array.isArray(photos) && photos.length > 0) {
        await tx.photos.createMany({
          data: photos.map((photo, index) => ({
            url: photo.url,
            caption: photo.caption ?? null,
            alt_text: photo.alt_text ?? null,
            position: photo.position ?? index,
            work_id: newWork.id,
          })),
        });
      }

      if (Array.isArray(authors) && authors.length > 0) {
        await tx.work_authors.createMany({
          data: authors.map((author) => ({
            work_id: newWork.id,
            author_id: author.author_id ?? null,
            group_id: author.group_id ?? null,
            role: author.role ?? null,
          })),
        });
      }

      return newWork;
    });

    const completeWork = await getCompleteWork(work.id);
    return res.status(201).json(completeWork);
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        error: "A work with these values already exists",
        detail: error.meta,
      });
    }

    if (error.code === "P2003") {
      return res.status(400).json({
        error:
          "One of the referenced authors, groups, or related records does not exist",
        detail: error.meta,
      });
    }

    next(error);
  }
}

export async function updateWork(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    if (!id) {
      return res.status(400).json({ error: "Work ID is required" });
    }

    if (
      body.title !== undefined &&
      (typeof body.title !== "string" || !body.title.trim())
    ) {
      return res.status(400).json({ error: "title cannot be empty" });
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
      return res
        .status(400)
        .json({ error: "latitude must be between -90 and 90" });
    }

    if (
      parsedLongitude !== undefined &&
      parsedLongitude !== null &&
      (parsedLongitude < -180 || parsedLongitude > 180)
    ) {
      return res
        .status(400)
        .json({ error: "longitude must be between -180 and 180" });
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.works.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existing) {
        const err = new Error("Work not found");
        err.statusCode = 404;
        throw err;
      }

      const dataToUpdate = {};
      const fieldValues = {
        title: body.title?.trim(),
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

      for (const [key, value] of Object.entries(fieldValues)) {
        if (value !== undefined) {
          dataToUpdate[key] = value;
        }
      }

      if (Object.keys(dataToUpdate).length > 0) {
        dataToUpdate.updated_at = new Date();

        await tx.works.update({
          where: { id },
          data: dataToUpdate,
        });
      }

      if (body.photos !== undefined) {
        await tx.photos.deleteMany({ where: { work_id: id } });

        if (Array.isArray(body.photos) && body.photos.length > 0) {
          await tx.photos.createMany({
            data: body.photos.map((photo, index) => ({
              url: photo.url,
              caption: photo.caption ?? null,
              alt_text: photo.alt_text ?? null,
              position: photo.position ?? index,
              work_id: id,
            })),
          });
        }
      }

      if (body.authors !== undefined) {
        await tx.work_authors.deleteMany({ where: { work_id: id } });

        if (Array.isArray(body.authors) && body.authors.length > 0) {
          await tx.work_authors.createMany({
            data: body.authors.map((author) => ({
              work_id: id,
              author_id: author.author_id ?? null,
              group_id: author.group_id ?? null,
              role: author.role ?? null,
            })),
          });
        }
      }
    });

    const updatedWork = await getCompleteWork(id);
    return res.json(updatedWork);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ message: "Work not found" });
    }

    if (error.code === "P2002") {
      return res.status(409).json({
        error: "Duplicate work author/group relationship",
        detail: error.meta,
      });
    }

    if (error.code === "P2003") {
      return res.status(400).json({
        error:
          "One of the referenced authors, groups, or related records does not exist",
        detail: error.meta,
      });
    }

    next(error);
  }
}

export async function deleteWork(req, res, next) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Work ID is required" });
    }

    await prisma.works.delete({
      where: { id },
    });

    return res.status(204).send();
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Work not found" });
    }

    next(error);
  }
}
