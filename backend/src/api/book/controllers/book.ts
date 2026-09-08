// @ts-nocheck
import { factories } from '@strapi/strapi';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const idFilter = (value) => (/^\d+$/.test(String(value)) ? { id: Number(value) } : { documentId: value });
const MAX_COVER_SIZE = 5 * 1024 * 1024;
const imageCount = (image) => {
  if (Array.isArray(image)) return image.length;
  if (image && Array.isArray(image.set)) return image.set.length;
  if (image && Array.isArray(image.connect)) return image.connect.length;
  return image ? 1 : 0;
};
const blocksToText = (value) => Array.isArray(value)
  ? value.map((block) => Array.isArray(block?.children) ? block.children.map((child) => child?.text || '').join('') : '').filter(Boolean).join('\n')
  : typeof value === 'string' ? value : '';

const normalizeUserText = (data, field, maxLength, ctx) => {
  if (!(field in data)) return true;
  if (data[field] != null && typeof data[field] !== 'string') {
    ctx.badRequest(`${field} must be plain text.`);
    return false;
  }
  const value = String(data[field] || '').trim();
  if (value.length > maxLength) {
    ctx.badRequest(`${field} cannot exceed ${maxLength} characters.`);
    return false;
  }
  data[field] = value || null;
  return true;
};

const attachCatalogCover = async (strapi, bookId, coverUrl, user) => {
  const response = await fetch(coverUrl, { signal: AbortSignal.timeout(8000), headers: { Accept: 'image/*' } });
  if (!response.ok) throw new Error(`Cover download failed with status ${response.status}`);
  const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  if (!contentType.startsWith('image/')) throw new Error('Catalogue cover is not an image');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_COVER_SIZE) throw new Error('Catalogue cover is larger than 5 MB');
  const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const filepath = path.join(os.tmpdir(), `book-cover-${bookId}-${Date.now()}.${extension}`);
  await fs.writeFile(filepath, buffer);
  try {
    return strapi.plugin('upload').service('upload').upload({
      data: { refId: bookId, ref: 'api::book.book', field: 'image' },
      files: { filepath, originalFilename: `book-cover-${bookId}.${extension}`, mimetype: contentType, size: buffer.length },
    }, { user });
  } finally {
    await fs.rm(filepath, { force: true });
  }
};

const publicBook = (book) => {
  if (!book) return book;
  const legacyDescription = blocksToText(book.description).trim();
  return {
    ...book,
    summary: book.summary || (book.catalogSource === 'openlibrary' ? legacyDescription : null),
    ownerComment: book.ownerComment || (book.catalogSource !== 'openlibrary' ? legacyDescription : null),
    owner: book.owner ? {
      id: book.owner.id,
      documentId: book.owner.documentId,
      username: book.owner.username,
    } : null,
  };
};

const markBooksWithActiveLoans = async (strapi, books) => {
  const activeLoans = await strapi.db.query('api::loan.loan').findMany({
    where: { status: 'active' },
    populate: { book: true },
  });
  const activeBookIds = new Set(activeLoans.map((loan) => loan.book?.id).filter(Boolean));
  return books.map((book) => activeBookIds.has(book.id) ? { ...book, available: false } : book);
};

export default factories.createCoreController('api::book.book', ({ strapi }) => ({
  async find(ctx) {
    // The public REST filter sanitizer does not expose the zone relation on
    // older local Strapi databases. Handle the simple zone slug explicitly so
    // LAN clients and future area URLs always receive the right catalogue.
    const zoneSlug = typeof ctx.query.zone === 'string' ? ctx.query.zone : null;
    if (zoneSlug) {
      const zone = await strapi.db.query('api::zone.zone').findOne({ where: { slug: zoneSlug }, select: ['id', 'name', 'slug'] });
      if (!zone) return ctx.notFound('Sharing area not found.');
      const ownerId = ctx.query.filters?.owner?.id?.$eq;
      const ownerUsername = String(ctx.query.owner || '').trim();
      const owners = ownerUsername
        ? await strapi.db.query('plugin::users-permissions.user').findMany({ where: { username: { $containsi: ownerUsername } }, select: ['id'] })
        : [];
      const requestedPage = Number(ctx.query.page || 1);
      const requestedPageSize = Number(ctx.query.pageSize || 24);
      const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
      const pageSize = Number.isFinite(requestedPageSize) ? Math.min(100, Math.max(1, Math.floor(requestedPageSize))) : 24;
      const search = String(ctx.query.search || '').trim();
      const favoriteIds = String(ctx.query.favoriteIds || '').split(',').map((id) => id.trim()).filter(Boolean);
      const where = {
        zone: zone.id,
        $or: [{ archived: false }, { archived: { $null: true } }],
        publishedAt: { $notNull: true },
        ...((ownerId || owners.length) ? { owner: ownerId ? Number(ownerId) : { $in: owners.map((item) => item.id) } } : ownerUsername ? { owner: -1 } : {}),
        ...(search ? { $and: [{ $or: [{ title: { $containsi: search } }, { author: { $containsi: search } }] }] } : {}),
        ...(ctx.query.age ? { age: String(ctx.query.age) } : {}),
        ...(ctx.query.language ? { language: String(ctx.query.language) } : {}),
        ...(ctx.query.available === 'true' ? { available: true } : ctx.query.available === 'false' ? { available: false } : {}),
        ...(ctx.query.favoriteIds ? { documentId: favoriteIds.length ? { $in: favoriteIds } : '__no_favorites__' } : {}),
      };
      const sort = String(ctx.query.sort || 'newest');
      const orderBy = sort === 'title-asc' ? { title: 'asc' } : sort === 'title-desc' ? { title: 'desc' } : sort === 'author-asc' ? { author: 'asc' } : { createdAt: 'desc' };
      const total = await strapi.db.query('api::book.book').count({ where });
      const books = await strapi.db.query('api::book.book').findMany({
        where,
        orderBy,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        populate: { owner: true, image: true, zone: true, loans: { populate: { borrower: true, conversation: true } } },
      });
      const data = (await markBooksWithActiveLoans(strapi, books)).map((book) => ({
        ...publicBook(book),
        hasLoanHistory: (book.loans || []).some((loan) => loan.status === 'active' || loan.status === 'returned'),
      }));
      return { data, meta: { pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total } } };
    }
    const response = await super.find(ctx);
    if (Array.isArray(response.data)) {
      response.data = await markBooksWithActiveLoans(strapi, response.data);
      response.data = response.data.map((book) => ({
        ...publicBook(book),
        hasLoanHistory: (book.loans || []).some((loan) => loan.status === 'active' || loan.status === 'returned'),
      }));
    }
    return response;
  },

  async findOne(ctx) {
    const response = await super.findOne(ctx);
    if (response.data) {
      response.data = (await markBooksWithActiveLoans(strapi, [response.data]))[0];
      response.data = publicBook(response.data);
      response.data.hasLoanHistory = (response.data.loans || []).some((loan) => loan.status === 'active' || loan.status === 'returned');
    }
    return response;
  },

  async catalogSearch(ctx) {
    const query = String(ctx.query.q || '').trim();
    if (query.length < 2) return ctx.badRequest('Enter at least two characters to search.');
    const params = new URLSearchParams({ q: query, limit: '8', fields: 'key,title,author_name,first_publish_year,isbn,cover_i,language,first_sentence,description' });
    try {
      const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } });
      if (!response.ok) return ctx.badGateway('The external book catalogue is temporarily unavailable.');
      const payload = await response.json();
      const languageMap = { fre: 'FR', fra: 'FR', eng: 'EN', gre: 'GR', ell: 'GR', spa: 'ES', ger: 'DE', deu: 'DE', ita: 'IT', por: 'PT', dut: 'NL', nld: 'NL', ara: 'AR', rus: 'RU', chi: 'ZH', zho: 'ZH', jpn: 'JA' };
      ctx.body = { data: (payload.docs || []).filter((book) => book.title).map((book) => ({
        id: book.key, title: book.title, author: book.author_name?.[0] || '', year: book.first_publish_year || null,
        isbn: book.isbn?.[0] || null, summary: Array.isArray(book.first_sentence) ? book.first_sentence[0] : (typeof book.description === 'string' ? book.description : null), language: languageMap[book.language?.[0]] || null,
        coverUrl: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : null,
      })) };
    } catch (error) {
      return ctx.badGateway('The external book catalogue is temporarily unavailable.');
    }
  },

  async favorites(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const account = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: userId },
      select: ['favoriteBookIds'],
    });
    const ids = Array.isArray(account?.favoriteBookIds) ? account.favoriteBookIds.filter((id) => typeof id === 'string') : [];
    const zoneSlug = String(ctx.query.zone || '').trim();
    const zone = zoneSlug ? await strapi.db.query('api::zone.zone').findOne({ where: { slug: zoneSlug }, select: ['id'] }) : null;
    // Clean stale references globally, but only return favorites belonging to
    // the currently selected area. Changing area must not erase other areas'
    // favorites from the user's profile.
    const existingBooks = ids.length ? await strapi.db.query('api::book.book').findMany({
      where: {
        documentId: { $in: ids },
        publishedAt: { $notNull: true },
        $or: [{ archived: false }, { archived: { $null: true } }],
      },
      select: ['documentId'],
      populate: { zone: true },
    }) : [];
    const validIds = existingBooks.map((book) => book.documentId).filter(Boolean);
    if (validIds.length !== ids.length) {
      await strapi.db.query('plugin::users-permissions.user').update({ where: { id: userId }, data: { favoriteBookIds: ids.filter((id) => validIds.includes(id)) } });
    }
    const scopedIds = zone ? existingBooks.filter((book) => book.zone?.id === zone.id).map((book) => book.documentId) : validIds;
    ctx.body = { data: ids.filter((id) => scopedIds.includes(id)) };
  },

  async toggleFavorite(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();
    const identifier = String(ctx.params.id || '');
    const book = await strapi.db.query('api::book.book').findOne({
      where: {
        ...idFilter(identifier),
        publishedAt: { $notNull: true },
        $or: [{ archived: false }, { archived: { $null: true } }],
      },
      select: ['documentId'],
    });
    if (!book?.documentId) return ctx.notFound('Book not found.');
    const account = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: userId },
      select: ['favoriteBookIds'],
    });
    const current = Array.isArray(account?.favoriteBookIds) ? account.favoriteBookIds.filter((id) => typeof id === 'string') : [];
    const isFavorite = current.includes(book.documentId);
    const favoriteBookIds = isFavorite ? current.filter((id) => id !== book.documentId) : [...current, book.documentId];
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: userId },
      data: { favoriteBookIds },
    });
    ctx.body = { data: { bookId: book.documentId, isFavorite: !isFavorite, favoriteBookIds } };
  },

  async create(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    const data = { ...(ctx.request.body?.data || {}) };
    delete data.description;
    if (!normalizeUserText(data, 'summary', 1500, ctx) || !normalizeUserText(data, 'ownerComment', 500, ctx)) return;
    if (!String(data.title || '').trim() || !String(data.author || '').trim()) {
      return ctx.badRequest('Title and author are required.');
    }
    if (imageCount(data.image) > 2) {
      return ctx.badRequest('A book can have at most 2 images.');
    }
    const requestedZone = data.zone;
    const connectedZone = requestedZone?.connect?.[0];
    const connectedZoneId = typeof connectedZone === 'string'
      ? connectedZone
      : connectedZone?.documentId || connectedZone?.id;
    const zoneValue = typeof requestedZone === 'string' ? requestedZone : null;
    const zoneSlug = typeof requestedZone === 'object' ? requestedZone?.slug : null;
    const zoneIdentifier = connectedZoneId || zoneValue || zoneSlug || 'heraklion';
    let zone = await strapi.db.query('api::zone.zone').findOne({
      where: { documentId: zoneIdentifier },
      select: ['id', 'documentId'],
    });
    if (!zone) {
      zone = await strapi.db.query('api::zone.zone').findOne({
        where: { slug: zoneIdentifier },
        select: ['id', 'documentId'],
      });
    }
    if (!zone) return ctx.badRequest('Please choose a valid sharing area.');
    const documents = strapi.documents('api::book.book');
    const draft = await documents.create({
      data: {
        ...data,
        owner: ctx.state.user.id,
        zone: zone.id,
      },
      populate: { owner: true, image: true, zone: true, loans: true },
    });
    // Catalogue covers are initially URLs. Cache a local Strapi copy so future
    // page loads do not depend on Open Library response time or availability.
    // Attach it to the draft before publishing so both document versions keep
    // the same media relation in Strapi's Draft & Publish workflow.
    if (data.catalogSource === 'openlibrary' && data.coverUrl && draft?.id && !data.image) {
      try {
        await attachCatalogCover(strapi, draft.id, data.coverUrl, ctx.state.user);
      } catch (error) {
        strapi.log.warn(`Unable to cache catalogue cover for book ${draft.id}: ${error.message}`);
      }
    }
    await documents.publish({ documentId: draft.documentId });
    const createdBook = await documents.findOne({
      documentId: draft.documentId,
      status: 'published',
      populate: { owner: true, image: true, zone: true, loans: true },
    });
    return { data: publicBook(createdBook) };
  },

  async update(ctx) {
    const book = await this.findOwnedBook(ctx);
    if (!book) return;
    const data = { ...(ctx.request.body?.data || {}) };
    delete data.owner;
    delete data.description;
    const historicalLoan = await strapi.db.query('api::loan.loan').findOne({
      where: { book: book.id, status: { $in: ['active', 'returned'] } },
    });
    if (historicalLoan) {
      ['title', 'author', 'coverUrl', 'isbn', 'catalogSource', 'catalogId', 'image', 'language', 'age', 'summary', 'ownerComment'].forEach((field) => delete data[field]);
    }
    if (!normalizeUserText(data, 'summary', 1500, ctx) || !normalizeUserText(data, 'ownerComment', 500, ctx)) return;
    if (book.catalogSource === 'openlibrary') {
      ['title', 'author', 'coverUrl', 'isbn', 'catalogSource', 'catalogId', 'image', 'language'].forEach((field) => delete data[field]);
    }
    if (imageCount(data.image) > 2) {
      return ctx.badRequest('A book can have at most 2 images.');
    }

    // A book involved in an active loan cannot be made available manually.
    // It becomes available again only after the return is confirmed by both
    // participants in the loan workflow.
    if (data.available === true) {
      const activeLoan = await strapi.db.query('api::loan.loan').findOne({
        where: { book: book.id, status: 'active' },
        populate: { borrower: true, conversation: true },
      });
      if (activeLoan) {
        return ctx.badRequest(
          'This book is currently lent. Confirm its return before making it available.',
          {
            conversationId: activeLoan.conversation?.documentId ?? activeLoan.conversation?.id,
            borrower: activeLoan.borrower?.username,
          }
        );
      }
    }
    const updatedBook = await strapi.db.query('api::book.book').update({
      where: { id: book.id },
      data,
      populate: { owner: true, image: true, zone: true, loans: { populate: { borrower: true } } },
    });
    return { data: updatedBook, meta: {} };
  },

  async delete(ctx) {
    const book = await this.findOwnedBook(ctx);
    if (!book) return;
    const loan = await strapi.db.query('api::loan.loan').findOne({
      where: { book: book.id, status: { $in: ['requested', 'active'] } },
      populate: { borrower: true, conversation: true },
    });
    if (loan) {
      return ctx.badRequest(
        'This book is currently requested or lent. Recover it before removing it.',
        { conversationId: loan.conversation?.documentId ?? loan.conversation?.id, borrower: loan.borrower?.username }
      );
    }
    const historicalLoan = await strapi.db.query('api::loan.loan').findOne({
      where: { book: book.id, status: { $in: ['refused', 'returned'] } },
    });
    if (historicalLoan) {
      const archivedBook = await strapi.db.query('api::book.book').update({
        where: { id: book.id },
        data: { archived: true, available: false },
      });
      await this.removeFromFavorites(strapi, book.documentId);
      return { data: archivedBook, meta: { archived: true } };
    }
    const result = await super.delete(ctx);
    await this.removeFromFavorites(strapi, book.documentId);
    return result;
  },

  async removeFromFavorites(strapi, documentId) {
    if (!documentId) return;
    const users = await strapi.db.query('plugin::users-permissions.user').findMany({ select: ['id', 'favoriteBookIds'] });
    for (const user of users) {
      if (!Array.isArray(user.favoriteBookIds) || !user.favoriteBookIds.includes(documentId)) continue;
      await strapi.db.query('plugin::users-permissions.user').update({ where: { id: user.id }, data: { favoriteBookIds: user.favoriteBookIds.filter((id) => id !== documentId) } });
    }
  },

  async findOwnedBook(ctx) {
    if (!ctx.state.user) {
      ctx.unauthorized();
      return null;
    }
    const identifier = ctx.params.documentId ?? ctx.params.id;
    const book = await strapi.db.query('api::book.book').findOne({
      where: { ...idFilter(identifier), publishedAt: { $notNull: true } },
      populate: { owner: true },
    });
    if (!book) {
      ctx.notFound('Book not found.');
      return null;
    }
    if (book.owner?.id !== ctx.state.user.id) {
      ctx.forbidden('You can only manage your own books.');
      return null;
    }
    return book;
  },
}));
