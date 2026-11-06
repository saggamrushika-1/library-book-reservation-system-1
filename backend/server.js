require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], connectSrc: ["'self'"] } } }));
app.use(express.json({ limit: '20kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LIBRARIAN_PASSWORD'];
const ready = required.every((key) => process.env[key] && !process.env[key].includes('replace'));
const db = ready ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function requireDb(req, res, next) { if (!db) return res.status(503).json({ error: 'Server is not configured. Fill in backend/.env and restart.' }); next(); }
function librarian(req, res, next) {
  const expected = process.env.LIBRARIAN_PASSWORD || '';
  const supplied = req.get('x-librarian-password') || '';
  if (!expected || supplied.length !== expected.length || !require('crypto').timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return res.status(401).json({ error: 'Librarian password is missing or incorrect.' });
  next();
}
function validateBook(body) {
  const b = { title: String(body.title || '').trim(), author: String(body.author || '').trim(), isbn: String(body.isbn || '').trim() || null, category: String(body.category || 'General').trim(), total_copies: Number(body.total_copies) };
  if (!b.title || b.title.length > 200 || !b.author || b.author.length > 150 || !b.category || b.category.length > 80 || !Number.isInteger(b.total_copies) || b.total_copies < 1 || b.total_copies > 10000) return null;
  return b;
}
app.get('/api/health', (req, res) => res.json({ ok: true, databaseConfigured: Boolean(db) }));
app.get('/api/books', requireDb, asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  let query = db.from('books').select('id,title,author,isbn,category,total_copies,available_copies,created_at').order('title');
  if (q) query = query.or(`title.ilike.%${q.replace(/[%_,().]/g, '')}%,author.ilike.%${q.replace(/[%_,().]/g, '')}%,category.ilike.%${q.replace(/[%_,().]/g, '')}%`);
  const { data, error } = await query;
  if (error) throw error;
  res.json({ books: data });
}));
app.post('/api/reservations', requireDb, asyncRoute(async (req, res) => {
  const book_id = String(req.body.book_id || '');
  const borrower_name = String(req.body.borrower_name || '').trim();
  const borrower_email = String(req.body.borrower_email || '').trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(book_id) || borrower_name.length < 2 || borrower_name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(borrower_email) || borrower_email.length > 254) return res.status(400).json({ error: 'Enter a valid name and email, then choose a book.' });
  const { data: book, error: bookError } = await db.from('books').select('id,available_copies').eq('id', book_id).single();
  if (bookError || !book) return res.status(404).json({ error: 'Book not found.' });
  if (book.available_copies < 1) return res.status(409).json({ error: 'This book is currently unavailable.' });
  const { data: reservation, error } = await db.from('reservations').insert({ book_id, borrower_name, borrower_email }).select('id,status,created_at').single();
  if (error) throw error;
  res.status(201).json({ reservation, message: 'Reservation request submitted. A librarian will confirm it.' });
}));
app.post('/api/librarian/login', (req, res) => {
  const expected = process.env.LIBRARIAN_PASSWORD || '';
  const supplied = String(req.body.password || '');
  if (!expected || supplied.length !== expected.length || !require('crypto').timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return res.status(401).json({ error: 'Incorrect librarian password.' });
  res.json({ ok: true });
});
app.use('/api/librarian', librarian);
app.get('/api/librarian/reservations', requireDb, asyncRoute(async (req, res) => {
  const { data, error } = await db.from('reservations').select('id,book_id,borrower_name,borrower_email,status,created_at,books(title,author)').order('created_at', { ascending: false });
  if (error) throw error;
  res.json({ reservations: data });
}));
app.post('/api/librarian/books', requireDb, asyncRoute(async (req, res) => {
  const book = validateBook(req.body);
  if (!book) return res.status(400).json({ error: 'Check the title, author, category, and copy count.' });
  const { data, error } = await db.from('books').insert({ ...book, available_copies: book.total_copies }).select().single();
  if (error?.code === '23505') return res.status(409).json({ error: 'That ISBN is already in the catalogue.' });
  if (error) throw error;
  res.status(201).json({ book: data });
}));
app.patch('/api/librarian/reservations/:id', requireDb, asyncRoute(async (req, res) => {
  const status = req.body.status;
  if (!['issued', 'returned', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Choose issued, returned, or cancelled.' });
  const { data: r, error } = await db.from('reservations').select('*').eq('id', req.params.id).single();
  if (error || !r) return res.status(404).json({ error: 'Reservation not found.' });
  if (r.status === status) return res.json({ reservation: r });
  if (r.status === 'returned' || r.status === 'cancelled') return res.status(409).json({ error: 'This reservation is already closed.' });
  if (status === 'issued') {
    const { data: b, error: be } = await db.from('books').select('available_copies').eq('id', r.book_id).single();
    if (be || b.available_copies < 1) return res.status(409).json({ error: 'No copies are currently available.' });
    const { error: adjust } = await db.from('books').update({ available_copies: b.available_copies - 1 }).eq('id', r.book_id);
    if (adjust) throw adjust;
  }
  if (status === 'returned' && r.status === 'issued') {
    const { data: b, error: be } = await db.from('books').select('available_copies,total_copies').eq('id', r.book_id).single();
    if (be) throw be;
    const { error: adjust } = await db.from('books').update({ available_copies: Math.min(b.total_copies, b.available_copies + 1) }).eq('id', r.book_id);
    if (adjust) throw adjust;
  }
  const { data, error: updateError } = await db.from('reservations').update({ status }).eq('id', r.id).select().single();
  if (updateError) throw updateError;
  res.json({ reservation: data });
}));
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => { console.error('Request failed:', err?.message || 'unknown error'); res.status(500).json({ error: 'Something went wrong. Check the server configuration and try again.' }); });
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Library Book Reservation System: http://localhost:${port}`));
