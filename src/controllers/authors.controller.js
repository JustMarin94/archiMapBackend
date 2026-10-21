import prisma from "../db/prisma.js";

/**
 * Helper to fetch a complete author with awards and photos
 */
async function fetchCompleteAuthor(authorId) {
  const author = await prisma.authors.findUnique({
    where: { id: authorId },
    include: {
      author_awards: {
        select: {
          id: true,
          title: true,
          year: true,
          description: true,
        },
      },
      photos: {
        orderBy: [
          { position: { sort: "asc", nulls: "last" } },
          { created_at: "asc" },
        ],
      },
    },
  });

  if (!author) return null;

  return {
    ...author,
    awards: author.author_awards,
    author_awards: undefined,
  };
}

/**
 * GET /authors
 */
export async function getAuthors(req, res, next) {
  try {
    const { full_name, title, typology, awards, region, yearStart, yearEnd } =
      req.query;

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

    const where = {};

    if (full_name) {
      where.full_name = { contains: full_name, mode: "insensitive" };
    }

    if (awards) {
      where.author_awards = {
        some: {
          title: { contains: awards, mode: "insensitive" },
        },
      };
    }

    // Check if any work/region/year filter is provided
    const hasWorkFilters =
      title ||
      typology ||
      region ||
      (parsedYearStart !== null && parsedYearEnd !== null);

    if (hasWorkFilters) {
      const workFilter = {};
      if (title) workFilter.title = { contains: title, mode: "insensitive" };
      if (typology) workFilter.typology = typology;
      if (region) workFilter.region = region;

      if (parsedYearStart !== null && parsedYearEnd !== null) {
        workFilter.year_start = { lte: parsedYearEnd };
        workFilter.year_end = { gte: parsedYearStart };
      }

      where.OR = [
        {
          work_authors: {
            some: {
              works: workFilter,
            },
          },
        },
        {
          author_group_members: {
            some: {
              author_groups: {
                work_authors: {
                  some: {
                    works: workFilter,
                  },
                },
              },
            },
          },
        },
      ];
    }

    const authors = await prisma.authors.findMany({
      where,
      include: {
        photos: {
          orderBy: [{ position: { sort: "asc", nulls: "last" } }],
        },
      },
      orderBy: { full_name: "asc" },
    });

    // Flatten to match the previous SQL LEFT JOIN structure (one row per photo or author)
    const result = [];
    for (const author of authors) {
      if (author.photos.length === 0) {
        result.push({
          ...author,
          image_id: null,
          photo_url: null,
          caption: null,
          alt_text: null,
          position: null,
          image_created_at: null,
          photos: undefined,
        });
      } else {
        for (const photo of author.photos) {
          result.push({
            ...author,
            image_id: photo.id,
            photo_url: photo.url,
            caption: photo.caption,
            alt_text: photo.alt_text,
            position: photo.position,
            image_created_at: photo.created_at,
            photos: undefined,
          });
        }
      }
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /authors/:id
 */
export async function getAuthorsByID(req, res, next) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Author ID is required" });
    }

    const author = await prisma.authors.findUnique({
      where: { id },
      include: {
        author_awards: {
          select: {
            id: true,
            title: true,
            year: true,
            description: true,
          },
        },
        photos: {
          orderBy: [{ position: { sort: "asc", nulls: "last" } }],
          take: 1, // Matches primary photo from left join layout if needed, or get all
        },
      },
    });

    if (!author) {
      return res.status(404).json({ message: "Author not found" });
    }

    const photo = author.photos[0] || {};

    const responseObj = {
      ...author,
      image_id: photo.id || null,
      photo_url: photo.url || null,
      caption: photo.caption || null,
      alt_text: photo.alt_text || null,
      position: photo.position ?? null,
      image_created_at: photo.created_at || null,
      awards: author.author_awards,
      author_awards: undefined,
      photos: undefined,
    };

    res.json(responseObj);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /authors/full-names
 */
export async function getAuthorsFullNames(req, res, next) {
  try {
    const authors = await prisma.authors.findMany({
      select: { full_name: true },
      orderBy: { full_name: "asc" },
    });

    res.json(authors.map((row) => row.full_name));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /authors
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
      photos, // 1. Destructure photos from req.body
    } = req.body;

    if (!full_name) {
      return res.status(400).json({ error: "full_name is required" });
    }

    // Format awards data for Prisma relation creation
    const formattedAwards = Array.isArray(awards)
      ? awards
          .map((award) => {
            const title = typeof award === "string" ? award : award?.title;
            const year = typeof award === "object" ? award?.year : null;
            const desc = typeof award === "object" ? award?.description : null;

            if (!title || title.trim() === "") return null;

            return {
              title: title.trim(),
              year: year ? parseInt(year, 10) : null,
              description: desc || null,
            };
          })
          .filter(Boolean)
      : [];

    // Format photos data for Prisma relation creation
    const formattedPhotos = Array.isArray(photos)
      ? photos
          .map((photo, index) => {
            if (!photo || !photo.url || photo.url.trim() === "") return null;

            return {
              url: photo.url,
              caption: photo.caption || "",
              alt_text: photo.alt_text || "",
              position: photo.position ?? index,
            };
          })
          .filter(Boolean)
      : [];

    // Create author with nested relations in a single atomic operation
    const newAuthor = await prisma.authors.create({
      data: {
        full_name,
        birth_year: birth_year ? parseInt(birth_year, 10) : null,
        death_year: death_year ? parseInt(death_year, 10) : null,
        education: education || null,
        description: description || null,
        author_awards: {
          create: formattedAwards,
        },
        photos: {
          create: formattedPhotos,
        },
      },
    });

    const completeAuthor = await fetchCompleteAuthor(newAuthor.id);
    res.status(201).json(completeAuthor);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /authors/:id
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
      photos,
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Author ID is required" });
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.authors.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existing) {
        const err = new Error("Author not found");
        err.statusCode = 404;
        throw err;
      }

      const dataToUpdate = {};
      if (full_name !== undefined) dataToUpdate.full_name = full_name;
      if (birth_year !== undefined)
        dataToUpdate.birth_year = birth_year ? parseInt(birth_year, 10) : null;
      if (death_year !== undefined)
        dataToUpdate.death_year = death_year ? parseInt(death_year, 10) : null;
      if (education !== undefined) dataToUpdate.education = education;
      if (description !== undefined) dataToUpdate.description = description;

      if (Object.keys(dataToUpdate).length > 0) {
        dataToUpdate.updated_at = new Date();
        await tx.authors.update({
          where: { id },
          data: dataToUpdate,
        });
      }

      if (photos !== undefined && Array.isArray(photos)) {
        await tx.photos.deleteMany({ where: { author_id: id } });

        if (photos.length > 0) {
          const photoData = photos
            .map((photo, index) => {
              if (!photo.url || photo.url.trim() === "") return null;
              return {
                url: photo.url,
                caption: photo.caption || "",
                alt_text: photo.alt_text || "",
                position: photo.position ?? index,
                author_id: id,
              };
            })
            .filter(Boolean);

          if (photoData.length > 0) {
            await tx.photos.createMany({ data: photoData });
          }
        }
      }

      if (awards !== undefined && Array.isArray(awards)) {
        await tx.author_awards.deleteMany({ where: { author_id: id } });

        if (awards.length > 0) {
          const awardData = awards
            .map((award) => {
              const title = typeof award === "string" ? award : award.title;
              const year = typeof award === "object" ? award.year : null;
              const desc = typeof award === "object" ? award.description : null;

              if (!title || title.trim() === "") return null;

              return {
                author_id: id,
                title: title.trim(),
                year: year ? parseInt(year, 10) : null,
                description: desc || null,
              };
            })
            .filter(Boolean);

          if (awardData.length > 0) {
            await tx.author_awards.createMany({ data: awardData });
          }
        }
      }
    });

    const updatedAuthor = await fetchCompleteAuthor(id);
    res.json(updatedAuthor);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ message: "Author not found" });
    }
    next(error);
  }
}

/**
 * DELETE /authors/:id
 */
export async function deleteAuthor(req, res, next) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Author ID is required" });
    }

    const deleted = await prisma.authors.delete({
      where: { id },
      select: { id: true },
    });

    res.json({ message: "Author successfully deleted", id: deleted.id });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Author not found" });
    }
    next(error);
  }
}

/**
 * GET /authors/awards
 */
export async function getAuthorsAwards(req, res, next) {
  try {
    const awards = await prisma.author_awards.findMany({
      select: { title: true },
      distinct: ["title"],
      orderBy: { title: "asc" },
    });

    res.json(awards.map((row) => row.title));
  } catch (error) {
    next(error);
  }
}
