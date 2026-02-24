/**
 * FABIE SIMULATOR - CORE LOGIC
 * Version: 4.0 (Multi-File / Multi-Workshop)
 */

const APP_DATA_KEY = 'fabie_v4_data';
const PIXELS_PER_METER = 30;
const OP_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];

const app = {
    data: {
        currentUser: null,
        scenarios: [],
        activeScenarioIndex: null,
        activeWorkshopIndex: 0
    },
    
    // État temporaire (non sauvegardé en JSON)
    temp: {
        draggedItem: null,
        resizedItem: null,
        recordingState: null, // { opId, taskId }
        dragOffset: { x: 0, y: 0 }
    },

    // --- AUTHENTIFICATION ---
    login: function() {
        const pass = document.getElementById('password').value;
        const user = document.getElementById('username').value;
        if(pass === "FABIE2026") {
            this.data.currentUser = user || "Utilisateur";
            document.getElementById('user-display').innerText = "👤 " + this.data.currentUser;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app-interface').style.display = 'block';
            this.loadFromStorage();
        } else {
            document.getElementById('login-error').style.display = 'block';
        }
    },

    // --- GESTION SCENARIOS ---
    loadFromStorage: function() {
        const stored = localStorage.getItem(APP_DATA_KEY);
        if(stored) this.data.scenarios = JSON.parse(stored);
        this.renderScenarioList();
    },

    saveToStorage: function() {
        localStorage.setItem(APP_DATA_KEY, JSON.stringify(this.data.scenarios));
        this.renderScenarioList();
    },

    newScenario: function() {
        const name = prompt("Nom du scénario :", "Scénario " + new Date().toLocaleTimeString());
        if(!name) return;
        
        const newSc = {
            id: 'sc_' + Date.now(),
            name: name,
            author: this.data.currentUser,
            date: new Date().toLocaleString(),
            globalHours: 7,
            workshops: [
                { id: 'ws_1', name: "Atelier Principal", width: 20, height: 12, items: [] }
            ],
            operators: {} // { opId: { name, color, cost, tasks: [] } }
        };
        
        this.data.scenarios.push(newSc);
        this.loadScenario(this.data.scenarios.length - 1);
        this.saveToStorage();
    },

    loadScenario: function(index) {
        this.data.activeScenarioIndex = index;
        this.data.activeWorkshopIndex = 0;
        
        // Update UI Lists
        this.renderScenarioList();
        this.renderWorkshopList();
        this.renderOperators(); // Important: Charge le panneau de droite
        
        // Load View
        this.loadWorkshopView();
    },

    getActiveScenario: function() {
        if(this.data.activeScenarioIndex === null) return null;
        return this.data.scenarios[this.data.activeScenarioIndex];
    },

    renderScenarioList: function() {
        const list = document.getElementById('scenario-list');
        list.innerHTML = '';
        this.data.scenarios.forEach((sc, idx) => {
            const div = document.createElement('div');
            div.className = `sc-item ${idx === this.data.activeScenarioIndex ? 'active' : ''}`;
            div.innerHTML = `<span>${sc.name}</span> <span style="font-size:10px; color:#888;">${sc.date.split(' ')[0]}</span>`;
            div.onclick = () => this.loadScenario(idx);
            
            // Delete button (right click)
            div.oncontextmenu = (e) => {
                e.preventDefault();
                if(confirm("Supprimer ce scénario ?")) {
                    this.data.scenarios.splice(idx, 1);
                    this.data.activeScenarioIndex = null;
                    this.saveToStorage();
                    document.getElementById('items-layer').innerHTML = ''; // Clear view
                }
            };
            list.appendChild(div);
        });
    },

    // --- GESTION ATELIERS (MULTI-PAGES) ---
    renderWorkshopList: function() {
        const sc = this.getActiveScenario();
        if(!sc) return;
        const list = document.getElementById('workshop-list');
        list.innerHTML = '';
        
        sc.workshops.forEach((ws, idx) => {
            const div = document.createElement('div');
            div.className = `ws-item ${idx === this.data.activeWorkshopIndex ? 'active' : ''}`;
            div.innerText = ws.name;
            div.onclick = () => this.switchWorkshop(idx);
            div.ondblclick = () => {
                const newName = prompt("Renommer atelier :", ws.name);
                if(newName) { ws.name = newName; this.saveToStorage(); this.renderWorkshopList(); }
            };
            list.appendChild(div);
        });
    },

    addWorkshop: function() {
        const sc = this.getActiveScenario();
        if(!sc) return;
        sc.workshops.push({
            id: 'ws_' + Date.now(),
            name: "Atelier " + (sc.workshops.length + 1),
            width: 15, height: 10, items: []
        });
        this.switchWorkshop(sc.workshops.length - 1);
        this.saveToStorage();
    },

    switchWorkshop: function(index) {
        this.data.activeWorkshopIndex = index;
        this.renderWorkshopList();
        this.loadWorkshopView();
    },

    loadWorkshopView: function() {
        const sc = this.getActiveScenario();
        if(!sc) return;
        const ws = sc.workshops[this.data.activeWorkshopIndex];

        // Update Inputs
        document.getElementById('room-width').value = ws.width;
        document.getElementById('room-height').value = ws.height;
        document.getElementById('global-hours').value = sc.globalHours;

        // Resize Container
        const container = document.getElementById('workshop-container');
        container.style.width = (ws.width * PIXELS_PER_METER) + 'px';
        container.style.height = (ws.height * PIXELS_PER_METER) + 'px';

        // Clear & Render Items
        const layer = document.getElementById('items-layer');
        layer.innerHTML = '';
        document.getElementById('svg-layer').innerHTML = ''; // Clear lines

        ws.items.forEach(item => {
            this.createItemDOM(item);
        });

        this.updateStats(); // Redessine les lignes et calculs
    },

    resizeRoom: function() {
        const sc = this.getActiveScenario();
        if(!sc) return;
        const ws = sc.workshops[this.data.activeWorkshopIndex];
        
        ws.width = parseFloat(document.getElementById('room-width').value);
        ws.height = parseFloat(document.getElementById('room-height').value);
        
        this.loadWorkshopView(); // Reload visuals
        this.saveToStorage();
    },

    // --- GESTION ITEMS ---
    addItem: function(type) {
        const sc = this.getActiveScenario();
        if(!sc) return;
        const ws = sc.workshops[this.data.activeWorkshopIndex];

        let w=45, h=30, text="Machine";
        if(type==='palette') { w=36; h=24; text="Palette"; }
        if(type==='scale') { w=24; h=24; text="Éch"; }
        if(type==='pillar') { w=15; h=15; text=""; }
        if(type==='waypoint') { w=15; h=15; text=""; }

        const newItem = {
            id: type + '_' + Date.now(),
            type: type,
            x: 50, y: 50,
            w: w, h: h,
            text: text
        };

        ws.items.push(newItem);
        this.createItemDOM(newItem);
        this.saveToStorage();
    },

    addOperator: function() {
        const sc = this.getActiveScenario();
        if(!sc) return;
        
        const opId = 'op_' + Date.now();
        const color = OP_COLORS[Object.keys(sc.operators).length % OP_COLORS.length];
        const name = "Opérateur " + (Object.keys(sc.operators).length + 1);

        // Add to Global Scenario Data
        sc.operators[opId] = { name: name, color: color, cost: 25, tasks: [] };

        // Add Visual to Current Workshop
        const ws = sc.workshops[this.data.activeWorkshopIndex];
        const newItem = {
            id: opId, type: 'person', x: 50, y: 50, w: 24, h: 24, text: name, color: color
        };
        ws.items.push(newItem);
        
        this.createItemDOM(newItem);
        this.renderOperators();
        this.saveToStorage();
    },

    createItemDOM: function(item) {
        const div = document.createElement('div');
        div.className = `item ${item.type}`;
        div.id = item.id;
        div.style.left = item.x + 'px';
        div.style.top = item.y + 'px';
        div.style.width = item.w + 'px';
        div.style.height = item.h + 'px';
        div.innerText = item.text;
        
        if(item.color) div.style.backgroundColor = item.color;

        // Events
        div.onmousedown = (e) => this.startDrag(e, item.id);
        div.onclick = (e) => this.handleItemClick(item.id);

        // Resizer (sauf waypoint)
        if(item.type !== 'waypoint' && item.type !== 'person') {
            const resizer = document.createElement('div');
            resizer.className = 'resize-handle';
            resizer.onmousedown = (e) => this.startResize(e, item.id);
            div.appendChild(resizer);
        }

        document.getElementById('items-layer').appendChild(div);
    },

    // --- INTERACTION SOURIS (DRAG & RESIZE) ---
    startDrag: function(e, id) {
        if(e.target.className.includes('resize')) return;
        if(this.temp.recordingState) return;

        this.temp.draggedItem = document.getElementById(id);
        const rect = this.temp.draggedItem.getBoundingClientRect();
        const containerRect = document.getElementById('workshop-container').getBoundingClientRect();
        
        this.temp.dragOffset.x = e.clientX - rect.left;
        this.temp.dragOffset.y = e.clientY - rect.top;

        document.onmousemove = (ev) => this.onDrag(ev);
        document.onmouseup = () => this.endDrag(id);
    },

    onDrag: function(e) {
        if(!this.temp.draggedItem) return;
        
        const container = document.getElementById('workshop-container');
        const containerRect = container.getBoundingClientRect();
        
        let x = e.clientX - containerRect.left - this.temp.dragOffset.x;
        let y = e.clientY - containerRect.top - this.temp.dragOffset.y;

        // Check Trash
        const trash = document.getElementById('trash-zone');
        const trashRect = trash.getBoundingClientRect();
        if(e.clientX > trashRect.left && e.clientY > trashRect.top && e.clientY < trashRect.bottom) {
            trash.classList.add('drag-over');
        } else {
            trash.classList.remove('drag-over');
        }

        this.temp.draggedItem.style.left = x + 'px';
        this.temp.draggedItem.style.top = y + 'px';
        this.updateStats(); // Redraw lines real-time
    },

    endDrag: function(id) {
        document.onmousemove = null;
        document.onmouseup = null;
        const el = this.temp.draggedItem;
        this.temp.draggedItem = null;

        // Handle Trash Drop
        const trash = document.getElementById('trash-zone');
        if(trash.classList.contains('drag-over')) {
            trash.classList.remove('drag-over');
            this.deleteItem(id);
            return;
        }

        // Update Data Model
        const sc = this.getActiveScenario();
        const ws = sc.workshops[this.data.activeWorkshopIndex];
        const item = ws.items.find(i => i.id === id);
        if(item) {
            item.x = parseInt(el.style.left);
            item.y = parseInt(el.style.top);
            this.saveToStorage();
        }
    },

    deleteItem: function(id) {
        const sc = this.getActiveScenario();
        const ws = sc.workshops[this.data.activeWorkshopIndex];
        
        // Remove from items
        ws.items = ws.items.filter(i => i.id !== id);
        
        // Remove from DOM
        const el = document.getElementById(id);
        if(el) el.remove();

        // If it's an operator, ask to remove global data too
        if(sc.operators[id]) {
            if(confirm("Supprimer aussi les données de l'opérateur ?")) {
                delete sc.operators[id];
                this.renderOperators();
            }
        }

        this.updateStats();
        this.saveToStorage();
    },

    // --- GAMMES OPÉRATOIRES & CALCULS ---
    renderOperators: function() {
        const sc = this.getActiveScenario();
        const container = document.getElementById('operators-list');
        container.innerHTML = '';
        if(!sc) return;

        for(const [opId, op] of Object.entries(sc.operators)) {
            const card = document.createElement('div');
            card.className = 'op-card';
            card.innerHTML = `
                <div class="op-header" style="background:${op.color}">
                    <span contenteditable="true" onblur="app.updateOpName('${opId}', this.innerText)">${op.name}</span>
                </div>
                <div class="op-body">
                    Coût: <input type="number" value="${op.cost}" onchange="app.updateOpCost('${opId}', this.value)" style="width:40px"> €/h
                    <div id="tasks-${opId}"></div>
                    <button onclick="app.addTask('${opId}')" style="width:100%; margin-top:5px; background:#eee; color:#333;">+ Tâche</button>
                </div>
            `;
            container.appendChild(card);
            op.tasks.forEach(t => this.renderTaskRow(opId, t));
        }
        this.updateStats();
    },

    renderTaskRow: function(opId, task) {
        const div = document.createElement('div');
        div.className = 'task-row';
        const isRec = this.temp.recordingState && this.temp.recordingState.taskId === task.id;
        
        div.innerHTML = `
            <input type="text" value="${task.name}" onchange="app.updateTask('${opId}','${task.id}', 'name', this.value)" style="flex:1">
            <input type="number" value="${task.time}" onchange="app.updateTask('${opId}','${task.id}', 'time', this.value)" style="width:30px">s
            <input type="number" value="${task.freq}" onchange="app.updateTask('${opId}','${task.id}', 'freq', this.value)" style="width:30px">x
            <button class="btn-rec ${isRec?'recording':''}" onclick="app.toggleRecord('${opId}','${task.id}')">📍</button>
            <button onclick="app.deleteTask('${opId}','${task.id}')" style="color:red;padding:0 4px;">×</button>
        `;
        document.getElementById(`tasks-${opId}`).appendChild(div);
    },

    addTask: function(opId) {
        const sc = this.getActiveScenario();
        sc.operators[opId].tasks.push({
            id: 't_' + Date.now(), name: 'Action', time: 10, freq: 1, steps: []
        });
        this.renderOperators();
        this.saveToStorage();
    },

    updateTask: function(opId, tId, field, val) {
        const sc = this.getActiveScenario();
        const t = sc.operators[opId].tasks.find(x => x.id === tId);
        if(t) t[field] = field === 'name' ? val : parseFloat(val);
        this.updateStats();
        this.saveToStorage();
    },

    updateOpCost: function(opId, val) {
        const sc = this.getActiveScenario();
        sc.operators[opId].cost = parseFloat(val);
        this.updateStats();
        this.saveToStorage();
    },

    // --- ENREGISTREMENT TRAJETS ---
    toggleRecord: function(opId, tId) {
        if(this.temp.recordingState) {
            this.temp.recordingState = null;
        } else {
            this.temp.recordingState = { opId: opId, taskId: tId };
        }
        this.renderOperators(); // Refresh buttons state
    },

    handleItemClick: function(itemId) {
        if(!this.temp.recordingState) return;
        const { opId, taskId } = this.temp.recordingState;
        const sc = this.getActiveScenario();
        const task = sc.operators[opId].tasks.find(t => t.id === taskId);
        
        // Ajouter le point avec référence à l'atelier courant
        task.steps.push({
            workshopIndex: this.data.activeWorkshopIndex,
            itemId: itemId
        });
        
        this.updateStats();
        this.saveToStorage();
    },

    deleteTask: function(opId, tId) {
        const sc = this.getActiveScenario();
        sc.operators[opId].tasks = sc.operators[opId].tasks.filter(t => t.id !== tId);
        this.renderOperators();
        this.saveToStorage();
    },

    // --- CŒUR DU SYSTÈME : DESSIN & CALCUL ---
    updateStats: function() {
        const sc = this.getActiveScenario();
        if(!sc) return;

        const svg = document.getElementById('svg-layer');
        svg.innerHTML = ''; // Reset Lignes
        
        const statsDiv = document.getElementById('stats-output');
        statsDiv.innerHTML = '';

        let totalTime = 0;
        let totalCost = 0;
        const refHours = parseFloat(document.getElementById('global-hours').value) || 7;

        for(const [opId, op] of Object.entries(sc.operators)) {
            let opTime = 0;
            let pathD = "";
            let prevEl = null;

            op.tasks.forEach(task => {
                opTime += (task.time * task.freq);

                // Dessin des lignes
                if(task.steps.length > 1) {
                    for(let i=0; i<task.steps.length; i++) {
                        const step = task.steps[i];
                        
                        // On ne dessine QUE si le point est dans l'atelier ACTUEL
                        if(step.workshopIndex === this.data.activeWorkshopIndex) {
                            const el = document.getElementById(step.itemId);
                            if(el) {
                                if(prevEl) {
                                    // Calcul coordonnées
                                    const x1 = parseInt(prevEl.style.left) + parseInt(prevEl.style.width)/2;
                                    const y1 = parseInt(prevEl.style.top) + parseInt(prevEl.style.height)/2;
                                    const x2 = parseInt(el.style.left) + parseInt(el.style.width)/2;
                                    const y2 = parseInt(el.style.top) + parseInt(el.style.height)/2;
                                    
                                    pathD += `M ${x1} ${y1} L ${x2} ${y2} `;
                                    
                                    // Calcul distance pour le coût (même si visuel caché)
                                    const distPx = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
                                    const distM = distPx / PIXELS_PER_METER;
                                    opTime += ((distM / 1.4) * task.freq);
                                }
                                prevEl = el; // Chainage
                            } else {
                                // Si l'élément précédent était dans un autre atelier, on brise la ligne visuelle
                                prevEl = null; 
                            }
                        } else {
                            prevEl = null; // Sortie de l'atelier courant
                        }
                    }
                }
            });

            // Affichage Ligne SVG
            if(pathD) {
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute("d", pathD);
                path.style.stroke = op.color;
                svg.appendChild(path);
            }

            // Calculs Opérateur
            const cost = (opTime / 3600) * op.cost;
            totalTime += opTime;
            totalCost += cost;

            statsDiv.innerHTML += `
                <div class="stat-card" style="border-color:${op.color}">
                    <strong>${op.name}</strong><br>
                    Temps: ${(opTime/60).toFixed(1)} min<br>
                    Coût: ${cost.toFixed(2)} €
                </div>
            `;
        }

        // Résumé Global
        const totalDiv = document.createElement('div');
        totalDiv.className = 'total-summary';
        totalDiv.innerHTML = `
            <strong>TOTAL GLOBAL</strong><br>
            Temps Cumulé: ${(totalTime/3600).toFixed(2)} h<br>
            Coût Production: ${totalCost.toFixed(2)} €
        `;
        statsDiv.prepend(totalDiv);
    },

    // --- IMPORT / EXPORT FICHIER ---
    exportData: function() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.data.scenarios));
        const dl = document.createElement('a');
        dl.setAttribute("href", dataStr);
        dl.setAttribute("download", "fabie_backup.json");
        document.body.appendChild(dl); dl.click(); dl.remove();
    },

    importData: function(input) {
        const file = input.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.data.scenarios = JSON.parse(e.target.result);
                this.saveToStorage();
                this.renderScenarioList();
                alert("Import réussi !");
            } catch(e) { alert("Fichier invalide"); }
        };
        reader.readAsText(file);
    }
};

// Initialisation
window.onload = function() {
    // Si déjà des données, on pré-charge (mais on reste sur login)
    const stored = localStorage.getItem(APP_DATA_KEY);
    if(stored) app.data.scenarios = JSON.parse(stored);
};
