const $ = (s) => document.querySelector(s);
const booksEl = $('#books');
const notice = $('#notice');
let books = [];
let librarianPassword = '';
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(librarianPassword ? { 'x-librarian-password': librarianPassword } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function safe(text) { return String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
async function loadBooks() {
  booksEl.innerHTML = '<div class="empty">Loading the collection…</div>';
  try {
    const q = $('#search').value.trim();
    const data = await api(`/api/books${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    books = data.books;
    $('#book-count').textContent = `${books.length} ${books.length === 1 ? 'book' : 'books'} in the collection`;
    booksEl.innerHTML = books.length ? books.map((b) => `<article class="book-card"><div class="book-meta"><span class="category">${safe(b.category)}</span><span class="availability ${b.available_copies ? '' : 'out'}">${b.available_copies ? 'Available' : 'On loan'}</span></div><h3>${safe(b.title)}</h3><div class="author">by ${safe(b.author)}</div><div class="card-bottom"><span class="copies">${b.available_copies} of ${b.total_copies} copies available</span><button class="reserve" data-book="${safe(b.id)}" ${b.available_copies ? '' : 'disabled'}>Request →</button></div></article>`).join('') : '<div class="empty">No books match that search. Try another title or author.</div>';
    booksEl.querySelectorAll('[data-book]').forEach((button) => button.addEventListener('click', () => openReserve(button.dataset.book)));
    notice.textContent = '';
  } catch (error) { booksEl.innerHTML = '<div class="empty">The catalogue could not load.</div>'; notice.textContent = error.message; }
}
let searchTimer;
$('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadBooks, 250); });
function openReserve(id) { const b = books.find((item) => item.id === id); if (!b) return; $('#reserve-book-id').value = id; $('#reserve-book').textContent = `${b.title} — ${b.author}`; $('#reserve-dialog').showModal(); }
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
$('#reserve-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try { const result = await api('/api/reservations', { method: 'POST', body: JSON.stringify({ book_id: $('#reserve-book-id').value, borrower_name: form.borrower_name.value, borrower_email: form.borrower_email.value }) }); $('#reserve-dialog').close(); notice.textContent = result.message; form.reset(); }
  catch (error) { let msg = form.querySelector('.form-error'); if (!msg) { msg = document.createElement('p'); msg.className = 'form-error'; form.append(msg); } msg.textContent = error.message; }
  finally { button.disabled = false; }
});
$('#librarian-open').addEventListener('click', () => { $('#librarian-dialog').showModal(); });
$('#librarian-login').addEventListener('submit', async (event) => {
  event.preventDefault(); const password = $('#staff-password').value;
  try { await api('/api/librarian/login', { method: 'POST', body: JSON.stringify({ password }) }); librarianPassword = password; $('#librarian-login').hidden = true; $('#staff-panel').hidden = false; await loadReservations(); }
  catch (error) { $('#staff-error').textContent = error.message; }
});
async function loadReservations() {
  const target = $('#requests-panel'); target.textContent = 'Loading requests…';
  try { const { reservations } = await api('/api/librarian/reservations'); target.innerHTML = reservations.length ? reservations.map((r) => `<div class="request-row"><strong>${safe(r.books?.title || 'Book')} · ${safe(r.borrower_name)}</strong><span>${safe(r.borrower_email)} · ${safe(r.status)} · ${new Date(r.created_at).toLocaleDateString()}</span><br><select data-reservation="${safe(r.id)}" aria-label="Change reservation status"><option value="">Update status…</option>${['issued','returned','cancelled'].map((s) => `<option value="${s}" ${r.status === s ? 'disabled' : ''}>Mark ${s}</option>`).join('')}</select></div>`).join('') : '<div class="empty">No reservation requests yet.</div>'; target.querySelectorAll('[data-reservation]').forEach((select) => select.addEventListener('change', async () => { if (!select.value) return; try { await api(`/api/librarian/reservations/${select.dataset.reservation}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) }); await loadReservations(); await loadBooks(); } catch (e) { window.alert(e.message); } })); }
  catch (error) { target.textContent = error.message; }
}
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === button)); $('#requests-panel').hidden = button.dataset.tab !== 'requests'; $('#add-book-form').hidden = button.dataset.tab !== 'add'; }));
$('#add-book-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; try { await api('/api/librarian/books', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); form.reset(); await loadBooks(); $('#requests-panel').hidden = false; $('#add-book-form').hidden = true; document.querySelector('[data-tab="requests"]').click(); notice.textContent = 'Book added to the catalogue.'; } catch (error) { window.alert(error.message); } });
$('#librarian-dialog').addEventListener('close', () => { if (librarianPassword) { librarianPassword = ''; $('#staff-password').value = ''; $('#librarian-login').hidden = false; $('#staff-panel').hidden = true; } });
loadBooks();
