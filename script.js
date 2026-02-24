// --- CONFIGURATION ---
const CONFIG = {
    pxPerMeter: 30,
    colors: ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c']
};

const app = {
    state: {
        user: null,
        scenarios: [],
        currentScIndex: null,
        currentWsIndex: 0
    },
    temp: {
        dragItem: null,
        offsetX: 0, offsetY: 0,
        recording: null // { opId, taskId }
    },

    // --- 1. INITIALISATION & LOGIN ---
    init: function() {
        const saved = localStorage.getItem('fabie_data_v5');
        if (saved) this.state.scenarios = JSON.parse(saved);
    },

    login: function() {
        const p = document.getElementById('password').value;
        const u = document.getElementById('username').value;
        if (p === "FABIE2026") {
            this.state.user = u || "Utilisateur";
            document.getElementById('user-display').textContent = this.state.user;
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('main-interface').style.display = 'block';
            this.renderScenarioList();
        } else {
            document.getElementById('login-msg').style.display = 'block';
        }
    },

    save: function() {
        localStorage.setItem('fabie_data_v5', JSON.stringify(this.state.scenarios));
        this.renderScenarioList(); // Pour mettre à jour les dates si besoin
    },

    // --- 2. GESTION SCENARIOS ---
    createScenario: function() {
        const name = prompt("Nom du scénario :", "Nouveau " + new Date().toLocaleTimeString());
        if (!name) return;
        
        const newSc = {
            id: 'sc_' + Date.now(),
            name: name,
            date: new Date().toLocaleDateString(),
            refHours: 7,
            workshops: [
                { id: 'ws_1', name: 'Atelier Principal', w: 20, h: 12, items: [] }
            ],
            operators: {} // { opId: { name, color, cost, tasks: [] } }
        };
        
        this.state.scenarios.push(newSc);
        this.loadScenario(this.state.scenarios.length - 1);
        this.save();
    },

    loadScenario: function(idx) {
        this.state.currentScIndex = idx;
        this.state.currentWsIndex = 0;
        
        // Mise à jour UI
        this.renderScenarioList();
        this.renderWorkshopList();
        this.renderOperators();
        
        // Chargement Vue
        this.loadWorkshopView();
    },

    renderScenarioList: function() {
        const list = document.getElementById('scenario-list');
        list.innerHTML = '';
        this.state.scenarios.forEach((sc, idx) => {
            const div = document.createElement('div');
            div.className = `item-row ${idx === this.state.currentScIndex ? 'active' : ''}`;
            div.innerHTML = `<span>${sc.name}</span> <span onclick="app.deleteScenario(${idx}, event)">🗑️</span>`;
            div.onclick = (e) => { if(e.target.tagName !== 'SPAN') this.loadScenario(idx); };
            list.appendChild(div);
        });
    },

    deleteScenario: function(idx, e) {
        e.stopPropagation();
        if (confirm("Supprimer ?")) {
            this.state.scenarios.splice(idx, 1);
            this.state.currentScIndex = null;
            this.save();
            document.getElementById('scenario-list').innerHTML = '';
            // Reset view
            document.getElementById('grid').style.width = '0px';
            document.getElementById('items-layer').innerHTML = '';
        }
    },

    // --- 3. GESTION ATELIERS (MULTI-PAGES) ---
    renderWorkshopList: function() {
        const sc = this.getSc();
        const list = document.getElementById('workshop-list');
        list.innerHTML = '';
        if (!sc) return;

        sc.workshops.forEach((ws, idx) => {
            const div = document.createElement('div');
            div.className = `item-row ${idx === this.state.currentWsIndex ? 'active' : ''}`;
            div.textContent = ws.name;
            div.onclick = () => {
                this.state.currentWsIndex = idx;
                this.renderWorkshopList();
                this.loadWorkshopView();
            };
            div.ondblclick = () => {
                const n = prompt("Renommer atelier :", ws.name);
                if (n) { ws.name = n; this.save(); this.renderWorkshopList(); }
            };
            list.appendChild(div);
        });
    },

    addWorkshop: function() {
        const sc = this.getSc();
        if (!sc) return;
        sc.workshops.push({ id: 'ws_'+Date.now(), name: "Atelier "+(sc.workshops.length+1), w:15, h:10, items:[] });
        this.state.currentWsIndex = sc.workshops.length - 1;
        this.save();
        this.renderWorkshopList();
        this.loadWorkshopView();
    },

    loadWorkshopView: function() {
        const sc = this.getSc();
        if (!sc) return;
        const ws = sc.workshops[this.state.currentWsIndex];

        // Dimensions
        document.getElementById('ws-width').value = ws.w;
        document.getElementById('ws-height').value = ws.h;
        document.getElementById('ref-hours').value = sc.refHours;
        this.resizeRoom(); // Ajuste la grille

        // Items
        const layer = document.getElementById('items-layer');
        layer.innerHTML = '';
        ws.items.forEach(item => this.createItemDOM(item));

        // SVG Lignes (Mise à jour)
        this.updateStats();
    },

    resizeRoom: function() {
        const sc = this.getSc();
        if (!sc) return;
        const ws = sc.workshops[this.state.currentWsIndex];
        
        ws.w = parseFloat(document.getElementById('ws-width').value);
        ws.h = parseFloat(document.getElementById('ws-height').value);
        
        const wPx = ws.w * CONFIG.pxPerMeter;
        const hPx = ws.h * CONFIG.pxPerMeter;
        
        const grid = document.getElementById('grid');
        grid.style.width = wPx + 'px';
        grid.style.height = hPx + 'px';
        
        // Ajuster SVG layer pour couvrir la grille
        const svg = document.getElementById('svg-layer');
        svg.style.width = wPx + 'px';
        svg.style.height = hPx + 'px';
        
        this.save();
    },

    // --- 4. ITEMS & DRAG DROP ---
    addItem: function(type) {
        const sc = this.getSc();
        if(!sc) return;
        const ws = sc.workshops[this.state.currentWsIndex];
        
        let w=45, h=30, txt="M";
        if(type==='palette') { w=36; h=24; txt="Pal"; }
        if(type==='pillar' || type==='waypoint') { w=15; h=15; txt=""; }
        
        const item = { id: type+'_'+Date.now(), type, x: 20, y: 20, w, h, txt };
        ws.items.push(item);
        this.createItemDOM(item);
        this.save();
    },

    addOperator: function() {
        const sc = this.getSc();
        if(!sc) return;
        const ws = sc.workshops[this.state.currentWsIndex];
        
        const opId = 'op_'+Date.now();
        const color = CONFIG.colors[Object.keys(sc.operators).length % CONFIG.colors.length];
        
        // Donnée Globale
        sc.operators[opId] = { name: "Opérateur "+(Object.keys(sc.operators).length+1), color, cost:25, tasks:[] };
        
        // Objet Visuel (placé dans l'atelier courant)
        const item = { id: opId, type: 'person', x: 50, y: 50, w:24, h:24, txt:'', color };
        ws.items.push(item);
        
        this.createItemDOM(item);
        this.renderOperators();
        this.save();
    },

    createItemDOM: function(item) {
        const div = document.createElement('div');
        div.className = `draggable ${item.type}`;
        div.id = item.id;
        div.style.left = item.x + 'px';
        div.style.top = item.y + 'px';
        div.style.width = item.w + 'px';
        div.style.height = item.h + 'px';
        div.innerText = item.txt;
        if(item.color) div.style.backgroundColor = item.color;

        div.onmousedown = (e) => this.startDrag(e, div);
        div.onclick = () => this.handleItemClick(item.id);

        document.getElementById('items-layer').appendChild(div);
    },

    startDrag: function(e, el) {
        if (this.temp.recording) return; // Pas de drag pendant enregistrement
        e.stopPropagation();
        this.temp.dragItem = el;
        this.temp.offsetX = e.clientX - el.offsetLeft;
        this.temp.offsetY = e.clientY - el.offsetTop;
        
        document.onmousemove = (e) => this.doDrag(e);
        document.onmouseup = () => this.stopDrag();
    },

    doDrag: function(e) {
        if (!this.temp.dragItem) return;
        const x = e.clientX - this.temp.offsetX;
        const y = e.clientY - this.temp.offsetY;
        this.temp.dragItem.style.left = x + 'px';
        this.temp.dragItem.style.top = y + 'px';
        
        // Check Corbeille
        const trash = document.getElementById('trash');
        const rT = trash.getBoundingClientRect();
        if(e.clientX > rT.left && e.clientX < rT.right && e.clientY > rT.top && e.clientY < rT.bottom) {
            trash.classList.add('drag-over');
        } else {
            trash.classList.remove('drag-over');
        }
        
        this.updateStats(); // Redessine les lignes en temps réel !
    },

    stopDrag: function() {
        document.onmousemove = null;
        document.onmouseup = null;
        const el = this.temp.dragItem;
        this.temp.dragItem = null;
        if(!el) return;

        const trash = document.getElementById('trash');
        if(trash.classList.contains('drag-over')) {
            trash.classList.remove('drag-over');
            this.deleteItem(el.id);
        } else {
            // Save pos
            const sc = this.getSc();
            const ws = sc.workshops[this.state.currentWsIndex];
            const item = ws.items.find(i => i.id === el.id);
            if(item) {
                item.x = parseInt(el.style.left);
                item.y = parseInt(el.style.top);
                this.save();
            }
        }
    },

    deleteItem: function(id) {
        const sc = this.getSc();
        const ws = sc.workshops[this.state.currentWsIndex];
        ws.items = ws.items.filter(i => i.id !== id);
        document.getElementById(id).remove();
        
        // Si c'est un opérateur, on supprime aussi ses gammes ?
        if(sc.operators[id] && confirm("Supprimer aussi les gammes de l'opérateur ?")) {
            delete sc.operators[id];
            this.renderOperators();
        }
        this.updateStats();
        this.save();
    },

    // --- 5. GAMMES & ENREGISTREMENT ---
    renderOperators: function() {
        const sc = this.getSc();
        const box = document.getElementById('operators-list');
        box.innerHTML = '';
        if(!sc) return;

        for(const [opId, op] of Object.entries(sc.operators)) {
            const card = document.createElement('div');
            card.className = 'op-card';
            card.innerHTML = `
                <div class="op-head" style="background:${op.color}">${op.name}</div>
                <div style="padding:5px;">
                    Coût: <input type="number" value="${op.cost}" style="width:40px" onchange="app.updOp('${opId}', 'cost', this.value)"> €/h
                    <div id="tasks-${opId}"></div>
                    <button onclick="app.addTask('${opId}')" style="width:100%;margin-top:5px;">+ Tâche</button>
                </div>
            `;
            box.appendChild(card);
            op.tasks.forEach(t => this.renderTask(opId, t));
        }
        this.updateStats();
    },

    renderTask: function(opId, t) {
        const div = document.createElement('div');
        div.className = 'task-row';
        const isRec = this.temp.recording && this.temp.recording.taskId === t.id;
        div.innerHTML = `
            <input value="${t.name}" style="flex:1" onchange="app.updTask('${opId}','${t.id}','name',this.value)">
            <input type="number" value="${t.time}" style="width:25px" onchange="app.updTask('${opId}','${t.id}','time',this.value)">s
            <input type="number" value="${t.freq}" style="width:25px" onchange="app.updTask('${opId}','${t.id}','freq',this.value)">x
            <button class="btn-rec ${isRec?'recording':''}" onclick="app.rec('${opId}','${t.id}')">📍</button>
            <button onclick="app.delTask('${opId}','${t.id}')" style="color:red;">×</button>
        `;
        document.getElementById(`tasks-${opId}`).appendChild(div);
    },

    addTask: function(opId) {
        this.getSc().operators[opId].tasks.push({ id:'t_'+Date.now(), name:'Tâche', time:10, freq:1, steps:[] });
        this.save(); this.renderOperators();
    },
    updTask: function(opId, tId, k, v) { 
        const t = this.getSc().operators[opId].tasks.find(x=>x.id===tId); 
        t[k] = (k==='name'?v:parseFloat(v)); 
        this.save(); this.updateStats(); 
    },
    updOp: function(opId, k, v) { this.getSc().operators[opId][k] = parseFloat(v); this.save(); this.updateStats(); },
    delTask: function(opId, tId) {
        const op = this.getSc().operators[opId];
        op.tasks = op.tasks.filter(t=>t.id!==tId);
        this.save(); this.renderOperators();
    },

    rec: function(opId, tId) {
        if(this.temp.recording) this.temp.recording = null;
        else this.temp.recording = { opId, taskId: tId };
        this.renderOperators(); // update buttons
    },

    handleItemClick: function(itemId) {
        if(!this.temp.recording) return;
        const { opId, taskId } = this.temp.recording;
        const t = this.getSc().operators[opId].tasks.find(x=>x.id===taskId);
        
        // Ajoute le point avec l'info de l'atelier
        t.steps.push({ wsIdx: this.state.currentWsIndex, itemId });
        this.save(); this.updateStats();
    },

    // --- 6. DESSIN SVG & CALCULS ---
    updateStats: function() {
        const sc = this.getSc();
        if(!sc) return;
        
        const svg = document.getElementById('svg-layer');
        svg.innerHTML = ''; // Reset Lignes
        const disp = document.getElementById('stats-display');
        disp.innerHTML = '';

        let totalTime = 0, totalCost = 0;
        const refH = parseFloat(document.getElementById('ref-hours').value) || 7;
        sc.refHours = refH; // save global ref

        for(const [opId, op] of Object.entries(sc.operators)) {
            let opTime = 0;
            let pathD = "";
            let prevEl = null;

            op.tasks.forEach(task => {
                opTime += (task.time * task.freq);

                // Dessin des traits (Points)
                if(task.steps.length > 1) {
                    for(let i=0; i<task.steps.length; i++) {
                        const step = task.steps[i];
                        // On ne dessine que si c'est dans l'atelier visible
                        if(step.wsIdx === this.state.currentWsIndex) {
                            const el = document.getElementById(step.itemId);
                            if(el) {
                                if(prevEl) {
                                    const x1 = parseInt(prevEl.style.left) + parseInt(prevEl.style.width)/2;
                                    const y1 = parseInt(prevEl.style.top) + parseInt(prevEl.style.height)/2;
                                    const x2 = parseInt(el.style.left) + parseInt(el.style.width)/2;
                                    const y2 = parseInt(el.style.top) + parseInt(el.style.height)/2;
                                    pathD += `M${x1},${y1} L${x2},${y2} `;
                                    
                                    // Calcul distance
                                    const distM = Math.sqrt(Math.pow(x2-x1,2)+Math.pow(y2-y1,2)) / CONFIG.pxPerMeter;
                                    opTime += (distM / 1.4) * task.freq;
                                }
                                prevEl = el;
                            } else { prevEl = null; }
                        } else { prevEl = null; }
                    }
                }
            });

            if(pathD) {
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute("d", pathD);
                path.style.stroke = op.color;
                svg.appendChild(path);
            }

            const cost = (opTime/3600) * op.cost;
            totalTime += opTime; totalCost += cost;

            disp.innerHTML += `<div style="border-left:4px solid ${op.color}; padding:5px; margin-bottom:5px; background:#fff; font-size:11px;">
                <strong>${op.name}</strong><br>${(opTime/60).toFixed(1)} min | ${cost.toFixed(2)}€
            </div>`;
        }

        disp.innerHTML = `<div style="background:#2c3e50; color:white; padding:8px; border-radius:4px; margin-bottom:10px;">
            <strong>TOTAL</strong><br>${(totalTime/3600).toFixed(2)}h | ${totalCost.toFixed(2)}€
        </div>` + disp.innerHTML;
    },

    // Utils
    getSc: function() { return this.state.scenarios[this.state.currentScIndex]; },
    
    // Import/Export
    downloadJSON: function() {
        const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state.scenarios));
        const a = document.createElement('a'); a.href = data; a.download = 'fabie_save.json'; a.click();
    },
    uploadJSON: function(input) {
        const file = input.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.state.scenarios = JSON.parse(e.target.result);
                this.save();
                alert("Importé avec succès !");
                this.loadScenario(0);
            } catch(x) { alert("Fichier invalide"); }
        };
        reader.readAsText(file);
    }
};

// Start
app.init();
