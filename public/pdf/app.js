// --- INIT WORKER ---
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- CONFIGURATION ---
// Icons are standardized emojis here
const TOOLS = [
    { id: 'merge', icon: '📚', color: 'bg-indigo-50 text-indigo-600', title: "Merge PDF", desc: "Combine multiple files & reorder pages." },
    { id: 'organize', icon: '✂️', color: 'bg-rose-50 text-rose-500', title: "Split & Edit", desc: "Rotate, delete, or extract specific pages.", type: 'pages' },
    { id: 'img2pdf', icon: '🖼️', color: 'bg-emerald-50 text-emerald-600', title: "Image to PDF", desc: "Convert JPG/PNG to PDF documents.", accept: "image/*" },
    { id: 'watermark', icon: '💧', color: 'bg-blue-50 text-blue-500', title: "Watermark", desc: "Add text overlay to pages.", inputs: [
        { id: 'wm-text', type: 'text', placeholder: 'Watermark Text', width: 'w-48' },
        { id: 'wm-color', type: 'select', options: ['Red', 'Grey', 'Blue'], width: 'w-24' }
    ]},
    { id: 'numbers', icon: '🔢', color: 'bg-slate-50 text-slate-600', title: "Page Numbers", desc: "Add pagination to footer." },
    { id: 'protect', icon: '🔒', color: 'bg-orange-50 text-orange-600', title: "Protect", desc: "Encrypt with password.", inputs: [
        { id: 'pass-set', type: 'password', placeholder: 'Set Password', width: 'w-40' }
    ]},
    { id: 'unlock', icon: '🔓', color: 'bg-teal-50 text-teal-600', title: "Unlock", desc: "Remove PDF password.", inputs: [
        { id: 'pass-unlock', type: 'password', placeholder: 'Original Password', width: 'w-40' }
    ]},
    { id: 'metadata', icon: '🏷️', color: 'bg-purple-50 text-purple-600', title: "Metadata", desc: "Edit Title & Author.", inputs: [
        { id: 'meta-title', type: 'text', placeholder: 'New Title', width: 'w-40' },
        { id: 'meta-author', type: 'text', placeholder: 'New Author', width: 'w-40' }
    ]},
    { id: 'flatten', icon: '🔨', color: 'bg-gray-50 text-gray-600', title: "Flatten", desc: "Make forms un-editable." }
];

// --- APP STATE ---
const app = {
    activeTool: null,
    files: [],
    sortable: null
};

const dom = {
    dash: document.getElementById('view-dashboard'),
    grid: document.getElementById('tool-grid'),
    work: document.getElementById('view-workspace'),
    workGrid: document.getElementById('grid-container'),
    settings: document.getElementById('tool-settings'),
    title: document.getElementById('tool-name'),
    empty: document.getElementById('empty-state'),
    input: document.getElementById('file-upload'),
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toast-msg')
};

// --- INITIALIZATION ---
function initDashboard() {
    dom.grid.innerHTML = '';
    TOOLS.forEach(t => {
        const div = document.createElement('button');
        // Standardized Icon Size (w-14 h-14) for all cards
        div.className = 'tool-card bg-white p-6 rounded-2xl border border-slate-200 text-left flex flex-col items-start gap-4';
        div.onclick = () => launchTool(t.id);
        div.innerHTML = `
            <div class="w-14 h-14 rounded-xl flex items-center justify-center text-3xl ${t.color}">
                ${t.icon}
            </div>
            <div>
                <h4 class="font-bold text-lg text-slate-800">${t.title}</h4>
                <p class="text-sm text-slate-500 mt-1 leading-relaxed">${t.desc}</p>
            </div>
        `;
        dom.grid.appendChild(div);
    });
}
initDashboard();

// --- NAVIGATION ---
function launchTool(toolId) {
    app.activeTool = toolId;
    const conf = TOOLS.find(t => t.id === toolId);
    
    dom.dash.classList.add('hidden');
    dom.work.classList.remove('hidden');
    dom.title.innerText = conf.title;
    dom.input.accept = conf.accept || ".pdf";
    dom.input.value = '';
    
    renderSettings(conf.inputs || []);
    initSortable();
}

function goHome() {
    dom.work.classList.add('hidden');
    dom.dash.classList.remove('hidden');
    resetWorkspace();
}

function renderSettings(inputs) {
    dom.settings.innerHTML = '';
    
    if (app.activeTool === 'organize') {
        const grp = document.createElement('div');
        grp.className = 'flex gap-2 bg-slate-100 p-1.5 rounded-lg';
        grp.innerHTML = `
            <button onclick="rotateSelected(90)" class="px-3 py-1.5 bg-white rounded shadow-sm text-sm font-semibold hover:text-iri">↻ 90°</button>
            <button onclick="deleteSelected()" class="px-3 py-1.5 bg-white rounded shadow-sm text-sm font-semibold hover:text-red-600 text-red-500">🗑 Delete</button>
        `;
        dom.settings.appendChild(grp);
    }

    inputs.forEach(inp => {
        if (inp.type === 'select') {
            const sel = document.createElement('select');
            sel.id = inp.id;
            sel.className = `p-2 rounded-lg border border-slate-300 text-sm focus:border-iri focus:ring-1 focus:ring-iri outline-none ${inp.width}`;
            inp.options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o;
                opt.innerText = o;
                sel.appendChild(opt);
            });
            dom.settings.appendChild(sel);
        } else {
            const i = document.createElement('input');
            i.id = inp.id;
            i.type = inp.type;
            i.placeholder = inp.placeholder;
            i.className = `p-2 rounded-lg border border-slate-300 text-sm focus:border-iri focus:ring-1 focus:ring-iri outline-none ${inp.width}`;
            dom.settings.appendChild(i);
        }
    });
}

// --- FILE LOGIC ---
dom.input.addEventListener('change', async (e) => {
    if (!e.target.files.length) return;
    showToast("Processing files...", true);
    dom.empty.classList.add('hidden');
    
    for (const file of e.target.files) {
        await addFileToGrid(file);
    }
    hideToast();
});

async function addFileToGrid(file) {
    const id = Math.random().toString(36).substr(2, 9);
    const isPdf = file.type === 'application/pdf';
    const conf = TOOLS.find(t => t.id === app.activeTool);

    // MODE A: Page Editor (Render all pages)
    if (conf.type === 'pages' && isPdf) {
        const buff = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(buff).promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const div = createCard(id, true);
            div.dataset.fileId = id;
            div.dataset.pageIdx = i - 1;
            div.dataset.rotation = 0;
            
            await renderThumbnail(pdf, i, div.querySelector('.thumb-area'));
            
            const num = document.createElement('span');
            num.className = 'absolute bottom-2 right-2 bg-slate-900/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded';
            num.innerText = i;
            div.querySelector('.thumb-area').appendChild(num);

            // Selection Logic
            div.onclick = (e) => {
                if (!e.target.closest('.drag-handle')) {
                    div.querySelector('.thumb-area').classList.toggle('selected');
                }
            };
            dom.workGrid.appendChild(div);
        }
        app.files.push({ id, file, buffer: buff });
    } 
    // MODE B: File Cards
    else {
        const div = createCard(id, false);
        div.dataset.fileId = id;
        
        const thumbArea = div.querySelector('.thumb-area');
        if (isPdf) {
            const buff = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(buff).promise;
            await renderThumbnail(pdf, 1, thumbArea);
        } else {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.className = 'w-full h-full object-contain';
            thumbArea.appendChild(img);
        }
        
        const name = document.createElement('div');
        name.className = 'p-3 text-xs font-semibold text-slate-700 truncate bg-white border-t border-slate-100';
        name.innerText = file.name;
        div.appendChild(name);

        dom.workGrid.appendChild(div);
        app.files.push({ id, file });
    }
}

function createCard(id, isPage) {
    const div = document.createElement('div');
    div.className = 'group relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition-all select-none';
    
    // Drag Handle
    const handle = document.createElement('div');
    handle.className = 'drag-handle absolute top-2 left-2 bg-white p-1.5 rounded shadow-sm border border-slate-100 cursor-grab z-10 text-slate-400 hover:text-iri transition-colors';
    handle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
    div.appendChild(handle);

    // Delete Button
    const del = document.createElement('button');
    del.className = 'absolute top-2 right-2 bg-white text-slate-400 hover:text-red-500 w-7 h-7 rounded shadow-sm border border-slate-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10';
    del.innerHTML = '&times;';
    del.onclick = (e) => { e.stopPropagation(); div.remove(); };
    div.appendChild(del);

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = `thumb-area w-full ${isPage ? 'h-56' : 'h-40'} bg-slate-50 relative overflow-hidden flex items-center justify-center`;
    div.appendChild(thumb);

    return div;
}

async function renderThumbnail(pdf, pageNum, container) {
    try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.6 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'w-full h-full object-contain';
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        container.appendChild(canvas);
    } catch (e) {
        container.innerText = "Preview N/A";
    }
}

// --- DRAG & DROP ---
function initSortable() {
    if (app.sortable) app.sortable.destroy();
    app.sortable = new Sortable(dom.workGrid, {
        animation: 200,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        onStart: () => document.body.style.cursor = 'grabbing',
        onEnd: () => document.body.style.cursor = 'default'
    });
}

// --- ACTIONS ---
function rotateSelected(deg) {
    document.querySelectorAll('.thumb-area.selected').forEach(el => {
        const card = el.closest('div[data-rotation]');
        let r = parseInt(card.dataset.rotation) || 0;
        r = (r + deg) % 360;
        card.dataset.rotation = r;
        el.querySelector('canvas').style.transform = `rotate(${r}deg)`;
    });
}

function deleteSelected() {
    document.querySelectorAll('.thumb-area.selected').forEach(el => {
        el.closest('.group').remove();
    });
}

function resetWorkspace() {
    app.files = [];
    app.activeTool = null;
    dom.workGrid.innerHTML = '';
    dom.empty.classList.remove('hidden');
}

// --- PROCESSING ENGINE ---
async function processFiles() {
    if (dom.workGrid.children.length === 0) return alert("Please add files first.");
    showToast("Generating PDF...", true);
    
    const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;

    try {
        const newPdf = await PDFDocument.create();
        const cards = Array.from(dom.workGrid.children);
        const conf = TOOLS.find(t => t.id === app.activeTool);

        // A. PAGE BASED (Organize)
        if (conf.type === 'pages') {
            const pdfCache = {};
            for (const f of app.files) pdfCache[f.id] = await PDFDocument.load(f.buffer);

            for (const card of cards) {
                const fid = card.dataset.fileId;
                const pIdx = parseInt(card.dataset.pageIdx);
                const rot = parseInt(card.dataset.rotation);
                
                const [page] = await newPdf.copyPages(pdfCache[fid], [pIdx]);
                if (rot !== 0) page.setRotation(degrees(page.getRotation().angle + rot));
                newPdf.addPage(page);
            }
        } 
        // B. FILE BASED (Merge/Utils)
        else {
            for (const card of cards) {
                const fObj = app.files.find(f => f.id === card.dataset.fileId);
                
                if (fObj.file.type.includes('image')) {
                    const imgBuff = await fObj.file.arrayBuffer();
                    let img = fObj.file.type.includes('png') ? await newPdf.embedPng(imgBuff) : await newPdf.embedJpg(imgBuff);
                    const p = newPdf.addPage([img.width, img.height]);
                    p.drawImage(img, {x:0, y:0, width: img.width, height: img.height});
                } else {
                    const srcBuff = await fObj.file.arrayBuffer();
                    let srcPdf;
                    
                    if (app.activeTool === 'unlock') {
                        const pass = document.getElementById('pass-unlock').value;
                        try { srcPdf = await PDFDocument.load(srcBuff, { password: pass }); }
                        catch { throw new Error("Incorrect Password"); }
                    } else {
                        srcPdf = await PDFDocument.load(srcBuff);
                    }
                    
                    const pgs = await newPdf.copyPages(srcPdf, srcPdf.getPageIndices());
                    pgs.forEach(p => newPdf.addPage(p));
                }
            }
        }

        // --- MODIFIERS ---
        const pages = newPdf.getPages();

        if (app.activeTool === 'watermark') {
            const text = document.getElementById('wm-text').value || 'DRAFT';
            const colorName = document.getElementById('wm-color').value;
            const col = colorName === 'Red' ? [1,0,0] : colorName === 'Blue' ? [0,0,1] : [0.5,0.5,0.5];
            const font = await newPdf.embedFont(StandardFonts.HelveticaBold);
            
            pages.forEach(p => {
                const {width, height} = p.getSize();
                p.drawText(text, {
                    x: width/2 - (text.length*15), y: height/2,
                    size: 60, font: font, color: rgb(...col),
                    opacity: 0.3, rotate: degrees(45)
                });
            });
        }

        if (app.activeTool === 'numbers') {
            const font = await newPdf.embedFont(StandardFonts.Courier);
            pages.forEach((p, i) => {
                p.drawText(`${i+1} / ${pages.length}`, {
                    x: p.getWidth() - 100, y: 20, size: 10, font: font, color: rgb(0,0,0)
                });
            });
        }

        if (app.activeTool === 'metadata') {
            const t = document.getElementById('meta-title').value;
            const a = document.getElementById('meta-author').value;
            if(t) newPdf.setTitle(t);
            if(a) newPdf.setAuthor(a);
        }

        if (app.activeTool === 'flatten') newPdf.getForm().flatten();
        if (app.activeTool === 'protect') {
            const pw = document.getElementById('pass-set').value;
            if (pw) newPdf.encrypt({ userPassword: pw, ownerPassword: pw });
        }

        // DOWNLOAD
        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `111iridescence_${app.activeTool}.pdf`;
        link.click();

        showToast("Success! Downloading...", false);
        setTimeout(hideToast, 2000);

    } catch (err) {
        console.error(err);
        alert(err.message);
        hideToast();
    }
}

function showToast(msg, loading) {
    dom.toastMsg.innerText = msg;
    dom.toast.classList.remove('translate-y-32', 'opacity-0');
    dom.toast.querySelector('.loader').style.display = loading ? 'block' : 'none';
}

function hideToast() {
    dom.toast.classList.add('translate-y-32', 'opacity-0');
}