document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase ---
    const firebaseConfig = {
        apiKey: "AIzaSyAYUuNxsYWI59ahvjKHZujKyTfi95DzNwU",
        authDomain: "mywolf-game.firebaseapp.com",
        databaseURL: "https://mywolf-game-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "mywolf-game",
        storageBucket: "mywolf-game.appspot.com",
        messagingSenderId: "1099375631706",
        appId: "1:1099375631706:web:a1f6ccbcf71b7176046763"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // --- Elements ---
    const roomIdDisplay = document.getElementById('room-id-display');
    const interactionTable = document.getElementById('player-interaction-table');
    const nightResultsDiv = document.getElementById('night-results');
    const nightTabsContainer = document.getElementById('night-tabs');
    let gmNoteArea, gmNoteBtn;
    let nightActionSummaryDiv;

    // --- Config ---
    const FACTIONS = [
        "Bầy Sói",
        "Phe Sói",
        "Phe Dân",
        "Phe trung lập",
        "Chức năng khác",
        "Chưa phân loại"
    ];

    const FACTION_GROUPS = [
        { display: 'Bầy Sói', factions: ['Bầy Sói'], className: 'faction-wolf' },
        { display: 'Phe Sói', factions: ['Phe Sói'], className: 'faction-wolf' },
        { display: 'Phe Dân', factions: ['Phe Dân'], className: 'faction-villager' },
        { display: 'Phe trung lập', factions: ['Phe trung lập'], className: 'faction-neutral' },
        { display: 'Khác', factions: ['Chức năng khác', 'Chưa phân loại'], className: 'faction-other' }
    ];

    const SELECTABLE_FACTIONS = [
        "Bầy Sói",
        "Phe Sói",
        "Phe Dân",
        "Phe trung lập",
    ];
    
    const KIND_TO_ACTION_MAP = {
        'shield': { key: 'protect', label: 'Bảo vệ', type: 'defense' },
        'save': { key: 'save', label: 'Cứu', type: 'defense' },
        'kill': { key: 'kill', label: 'Giết', type: 'damage' },
        'disable': { key: 'disable_action', label: 'Vô hiệu hóa', type: 'debuff' },
        'check': { key: 'check', label: 'Kiểm tra', type: 'info' },
        'audit': { key: 'audit', label: 'Soi phe Sói', type: 'info' },
        'invest': { key: 'invest', label: 'Điều tra', type: 'info' },
        'killwolf': { key: 'killwolf', label: 'Giết Sói', type: 'damage' },
        'killvillager': { key: 'killvillager', label: 'Giết Dân', type: 'damage' },
    };

    let ALL_ACTIONS = {};

    // --- State ---
    let roomPlayers = [];
    let allRolesData = {};
    let nightStates = [];
    let activeNightIndex = 0;
    let nextActionId = 0;
    let roomId = null;

    // --- Data Fetching ---
    const fetchAllRolesData = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải dữ liệu vai trò.');
            const rawData = await response.json();
            
            allRolesData = rawData.reduce((acc, role) => {
                const roleName = (role.RoleName || '').trim();
                if (roleName) {
                    acc[roleName] = {
                        faction: (role.Faction || 'Chưa phân loại').trim(),
                        active: (role.Active || '0').trim(),
                        kind: (role.Kind || 'empty').trim()
                    };
                }
                return acc;
            }, {});

            ALL_ACTIONS = Object.values(KIND_TO_ACTION_MAP).reduce((acc, action) => {
                acc[action.key] = action;
                return acc;
            }, {});
            ALL_ACTIONS['wolf_bite_group'] = { label: 'Sói cắn', type: 'damage' };

        } catch (error) {
            console.error("Lỗi tải dữ liệu vai trò:", error);
            interactionTable.innerHTML = `<p style="color:red;">Lỗi: Không thể tải dữ liệu vai trò từ Google Sheet.</p>`;
        }
    };

    function saveNightNotes() {
        if (roomId) database.ref(`rooms/${roomId}/nightNotes`).set(nightStates);
    }
    
    function isActionAvailable(player, currentNightIndex) {
        const rule = player.activeRule;
        const nightNumber = currentNightIndex + 1;

        if (!rule || rule === '0' || player.kind === 'empty') {
            return false;
        }

        const parts = rule.split('_');
        const uses = parts[0];
        const startNight = parts.length > 1 ? parseInt(parts[1], 10) : 1;

        if (nightNumber < startNight) {
            return false;
        }

        if (uses === '1') {
            let timesUsed = 0;
            for (let i = 0; i <= currentNightIndex; i++) {
                if (nightStates[i] && nightStates[i].actions) {
                    for (const action of nightStates[i].actions) {
                        if (action.actorId === player.id && action.action !== 'wolf_bite_group') {
                            timesUsed++;
                        }
                    }
                }
            }
            if (timesUsed > 0) {
                return false;
            }
        }
        
        return true;
    }

    // --- Logic ---
    const calculateNightStatus = (nightState) => {
        if (!nightState) return { liveStatuses: {}, finalStatus: {}, deadPlayerNames: [] };
        
        const actions = nightState.actions || [];
        const initialStatus = nightState.playersStatus;
        const finalStatus = JSON.parse(JSON.stringify(initialStatus));
        const liveStatuses = {}; 

        // --- Giai đoạn 0: Khởi tạo trạng thái cho đêm nay ---
        Object.keys(initialStatus).forEach(pId => {
            if (initialStatus[pId].isAlive) {
                const player = roomPlayers.find(p => p.id === pId);
                liveStatuses[pId] = {
                    damage: 0,
                    isProtected: false,
                    isSaved: false,
                    isDisabled: initialStatus[pId].isDisabled || false,
                    armor: (player?.kind === 'armor1') ? 2 : 1,
                    isInDanger: false,
                    isDead: false,
                };
            }
        });

        // --- Giai đoạn 1: Xử lý các hành động ưu tiên (Vô hiệu hóa, Phòng thủ) ---
        actions.forEach(({ actorId, targetId }) => {
            const actor = roomPlayers.find(p => p.id === actorId);
            if (!actor || liveStatuses[actorId]?.isDisabled) return;

            const targetStatus = liveStatuses[targetId];
            if (!targetStatus) return;

            if (actor.kind === 'disable') {
                targetStatus.isDisabled = true;
            }
            else if (actor.kind === 'shield') {
                targetStatus.isProtected = true;
            }
        });
        
        // --- Giai đoạn 2: Xử lý các hành động Tấn công ---
        actions.forEach(({ actorId, targetId }) => {
            const actor = roomPlayers.find(p => p.id === actorId);
            const targetStatus = liveStatuses[targetId];
            if (!targetStatus) return;

            if (actorId === 'wolf_group') { 
                targetStatus.damage++;
                return;
            }

            if (!actor || liveStatuses[actorId]?.isDisabled) return;
            
            if (actor.kind.includes('kill')) {
                targetStatus.damage++;
            }
        });

        // --- Giai đoạn 3: Xử lý các hành động sau cùng (Cứu) ---
        actions.forEach(({ actorId, targetId }) => {
             const actor = roomPlayers.find(p => p.id === actorId);
             if (!actor || liveStatuses[actorId]?.isDisabled) return;

             const targetStatus = liveStatuses[targetId];
             if (!targetStatus) return;

             if (actor.kind.includes('save')) {
                 targetStatus.isSaved = true;
             }
        });

        // --- Giai đoạn 4: Tổng kết kết quả ---
        const deadPlayerNames = [];
        Object.keys(liveStatuses).forEach(pId => {
            const status = liveStatuses[pId];
            let effectiveDamage = status.damage;
            if (status.damage > 0) status.isInDanger = true;

            if (status.isProtected) {
                effectiveDamage = 0;
            }
            
            if (effectiveDamage > 0 && status.armor > 1) {
                const damageAbsorbed = Math.min(effectiveDamage, status.armor - 1);
                status.armor -= damageAbsorbed;
                effectiveDamage -= damageAbsorbed;
            }

            if (effectiveDamage > 0 && !status.isSaved) {
                status.isDead = true;
                finalStatus[pId].isAlive = false;
                const player = roomPlayers.find(p => p.id === pId);
                if(player) deadPlayerNames.push(player.name);
            }
        });
        
        return { liveStatuses, finalStatus, deadPlayerNames };
    };

    function buildNightActionSummary(nightState) {
        if (!nightState || !Array.isArray(nightState.actions)) return "<em>Chưa có hành động nào trong đêm này.</em>";
        let result = "";

        const wolfBiteActions = nightState.actions.filter(a => a.action === 'wolf_bite_group');
        if (wolfBiteActions.length) {
            const targets = wolfBiteActions.map(a => {
                const p = roomPlayers.find(x => x.id === a.targetId);
                return p ? `${p.name}${p.roleName ? " ("+p.roleName+")" : ""}` : "???";
            });
            result += `<div class="night-action-summary-item"><strong style="color:#f85149;">Bầy Sói</strong> chọn cắn: ${targets.join(', ')}</div>`;
        }

        nightState.actions.filter(a => a.action !== 'wolf_bite_group').forEach(({ action, targetId, actorId }) => {
            const actor = roomPlayers.find(p => p.id === actorId);
            const target = roomPlayers.find(p => p.id === targetId);
            let actorName = actor ? actor.name : "???";
            let actorRole = actor && actor.roleName ? actor.roleName : "";
            let targetName = target ? target.name : "???";
            let targetRole = target && target.roleName ? target.roleName : "";
            let text = `${actorName}${actorRole ? " ("+actorRole+")" : ""} chọn ${ALL_ACTIONS[action]?.label || action} ${targetName}${targetRole ? " ("+targetRole+")" : ""}`;
            result += `<div class="night-action-summary-item">${text}</div>`;
        });

        if (Array.isArray(nightState.factionChanges)) {
            nightState.factionChanges.forEach(change => {
                const player = roomPlayers.find(p => p.id === change.playerId);
                const name = player ? player.name : "???";
                const role = player ? (player.roleName || "") : "";
                result += `<div class="night-action-summary-item"><span style="color:#d29922;"><strong>${name}${role ? " ("+role+")" : ""}</strong> chuyển sang phe <strong>${change.newFaction}</strong></span></div>`;
            });
        }

        return result || "<em>Chưa có hành động nào trong đêm này.</em>";
    }

    // --- Rendering ---
    const render = () => {
        interactionTable.innerHTML = '';
        const nightState = nightStates[activeNightIndex];
        if (!nightState) {
            nightResultsDiv.innerHTML = '<p>Chưa có đêm nào bắt đầu.</p>';
            nightTabsContainer.innerHTML = '';
            if (gmNoteArea) gmNoteArea.style.display = "none";
            if (gmNoteBtn) gmNoteBtn.style.display = "none";
            if (nightActionSummaryDiv) nightActionSummaryDiv.style.display = "none";
            return;
        }
        const { liveStatuses } = calculateNightStatus(nightState);

        FACTION_GROUPS.forEach(group => {
            const groupPlayers = roomPlayers.filter(p => group.factions.includes(p.faction));
            if (groupPlayers.length === 0) return;
            
            const wrapper = document.createElement('div');
            wrapper.className = `faction-group-wrapper ${group.className || ''}`;

            const header = document.createElement('div');
            header.className = `faction-header ${group.className || ''}`;
            header.textContent = group.display;
            wrapper.appendChild(header);

            if (group.factions.includes('Bầy Sói')) {
                const wolfRow = document.createElement('div');
                wolfRow.className = 'player-row wolf-bite-group-row';
                wolfRow.innerHTML = `
                    <div class="player-header">
                        <div class="player-info"><div class="player-name">Hành Động Chung (Bầy Sói)</div></div>
                        <div class="wolf-bite-controls" style="margin-top:10px;">
                            <label style="font-weight:600; color:var(--danger-color); margin-right:8px;">Sói cắn:</label>
                            <select multiple class="wolf-bite-target-select" style="min-width:120px; background:#21262c; color:#c9d1d9; border-radius:7px;">
                                ${roomPlayers.filter(p => nightState.playersStatus[p.id]?.isAlive)
                                    .map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                            </select>
                            <button class="wolf-bite-group-btn btn-danger" style="margin-left:12px;">Thêm hành động</button>
                        </div>
                    </div>
                    <div class="action-list wolf-bite-group-list"></div>
                `;
                const wolfActionListDiv = wolfRow.querySelector('.wolf-bite-group-list');
                if (nightStates[activeNightIndex] && Array.isArray(nightStates[activeNightIndex].actions)) {
                    nightStates[activeNightIndex].actions.forEach(action => {
                        if (action.action === 'wolf_bite_group') {
                            const target = roomPlayers.find(p => p.id === action.targetId);
                            wolfActionListDiv.innerHTML += `<div class="action-item" data-action-id="${action.id}"><i class="fas fa-arrow-right"></i><span class="action-type-damage">Sói cắn</span><span class="target-name">${target?.name || 'Không rõ'}</span><button class="remove-action-btn" title="Xóa">&times;</button></div>`;
                        }
                    });
                }
                wrapper.appendChild(wolfRow);
            }
            
            groupPlayers.sort((a, b) => a.name.localeCompare(b.name)).forEach(player => {
                const playerState = nightState.playersStatus[player.id];
                const lStatus = liveStatuses[player.id];
                wrapper.appendChild(createPlayerRow(player, playerState, lStatus, nightState.isFinished));
            });

            interactionTable.appendChild(wrapper);
        });

        renderNightTabs();

        if (!nightActionSummaryDiv) {
            nightActionSummaryDiv = document.createElement('div');
            nightActionSummaryDiv.id = "night-action-summary";
            nightResultsDiv.parentNode.insertBefore(nightActionSummaryDiv, nightResultsDiv.nextSibling);
        }
        nightActionSummaryDiv.style.display = "block";
        nightActionSummaryDiv.innerHTML = `<div style="font-weight:700; color:#58a6ff; margin-bottom:8px;">Tất cả hành động trong đêm:</div>${buildNightActionSummary(nightState)}`;

        if (!gmNoteArea) {
            gmNoteArea = document.createElement('textarea');
            gmNoteArea.id = "gm-night-note";
            gmNoteArea.rows = 2;
            gmNoteArea.placeholder = "Ghi chú của quản trò cho đêm này...";
            nightResultsDiv.parentNode.insertBefore(gmNoteArea, nightActionSummaryDiv.nextSibling);
        }
        if (!gmNoteBtn) {
            gmNoteBtn = document.createElement('button');
            gmNoteBtn.id = "save-gm-night-note-btn";
            gmNoteBtn.textContent = "Lưu ghi chú đêm";
            gmNoteBtn.className = "btn-end-night";
            gmNoteArea.parentNode.insertBefore(gmNoteBtn, gmNoteArea.nextSibling);
            gmNoteBtn.onclick = function() {
                nightStates[activeNightIndex].gmNote = gmNoteArea.value;
                saveNightNotes();
                gmNoteBtn.textContent = "Đã lưu!";
                setTimeout(()=>gmNoteBtn.textContent="Lưu ghi chú đêm",1000);
            }
        }
        gmNoteArea.style.display = "block";
        gmNoteBtn.style.display = "inline-block";
        gmNoteArea.value = nightState.gmNote || "";

        let deleteBtn = document.getElementById('delete-nightnote-btn');
        if (!deleteBtn) {
            deleteBtn = document.createElement('button');
            deleteBtn.id = "delete-nightnote-btn";
            deleteBtn.className = "btn-danger";
            deleteBtn.textContent = "Xóa Night Note";
            deleteBtn.style.marginBottom = "10px";
            interactionTable.parentNode.insertBefore(deleteBtn, interactionTable);
            deleteBtn.addEventListener('click', function() {
                if (confirm('Bạn có chắc chắn muốn xóa toàn bộ night note không?')) {
                    nightStates = [];
                    activeNightIndex = 0;
                    saveNightNotes();
                    render();
                }
            });
        }
        
        if (nightState) {
            const { deadPlayerNames } = calculateNightStatus(nightState);
            if (nightState.isFinished) {
                nightResultsDiv.innerHTML = deadPlayerNames.length > 0
                    ? `<strong>Đã chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`
                    : '<p>Không có ai chết trong đêm nay.</p>';
            } else {
                nightResultsDiv.innerHTML = '<p>Đang chờ kết quả...</p>';
            }
        } else {
            nightResultsDiv.innerHTML = '<p>Chưa có đêm nào bắt đầu.</p>';
        }
    };

    function createPlayerRow(player, playerState, liveStatus, isFinished) {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = player.id;

        if (!playerState.isAlive) row.classList.add('status-dead');
        if (playerState.isDisabled) row.classList.add('status-disabled');
        if (liveStatus) {
            if (liveStatus.isProtected) row.classList.add('status-protected');
            if (liveStatus.isHealed && !liveStatus.isProtected) row.classList.add('status-saved');
            if (liveStatus.isInDanger && !liveStatus.isProtected && !liveStatus.isHealed) row.classList.add('status-danger');
            if (isFinished && liveStatus.isDead) row.classList.add('status-dead-calculated');
        }

        const factionSelectHTML = `<select class="player-faction-select" style="display:none;">${SELECTABLE_FACTIONS.map(f => `<option value="${f}"${player.faction===f?' selected':''}>${f}</option>`).join('')}</select>`;
        const changeFactionBtnHTML = `<button class="change-faction-btn">Chuyển phe</button>`;

        let optionsHTML = '';
        
        if (isActionAvailable(player, activeNightIndex)) {
            const kinds = player.kind.split('_');
            
            optionsHTML += `<optgroup label="Hành động ${player.roleName}">`;
            kinds.forEach(k => {
                const actionInfo = KIND_TO_ACTION_MAP[k];
                if (actionInfo) {
                    optionsHTML += `<option value="${actionInfo.key}">${actionInfo.label}</option>`;
                }
            });
            optionsHTML += `</optgroup>`;
        }
        
        const livingPlayers = roomPlayers.filter(p => nightStates[activeNightIndex]?.playersStatus[p.id]?.isAlive);
        const showActionControls = playerState.isAlive && !isFinished && !playerState.isDisabled && optionsHTML.trim() !== '';
        
        const actionControlsHTML = `
            <div class="action-controls">
                <select class="action-select"><option value="">-- Chọn hành động --</option>${optionsHTML}</select>
                <select class="target-select"><option value="">-- Chọn mục tiêu --</option>${livingPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
                <button class="add-action-btn" title="Thêm hành động"><i class="fas fa-plus"></i></button>
            </div>`;

        let actionListHTML = buildActionList(player.id, nightStates[activeNightIndex]);

        row.innerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-role">${player.roleName || 'Chưa có vai'} <span style="font-style:italic; opacity:0.8;">(${player.faction})</span></div>
                    <div>${changeFactionBtnHTML}${factionSelectHTML}</div>
                </div>
                <div class="player-status-controls">
                    <button class="status-btn life ${playerState.isAlive ? 'alive' : 'dead'}" title="Sống/Chết"><i class="fas fa-heart"></i></button>
                    <button class="status-btn disable ${playerState.isDisabled ? 'disabled' : 'enabled'}" title="${playerState.isDisabled ? 'Bật lại chức năng' : 'Vô hiệu hóa'}"><i class="fas fa-user-slash"></i></button>
                    ${playerState.isDisabled ? '<span class="disable-label">VÔ HIỆU</span>' : ''}
                </div>
                ${showActionControls ? actionControlsHTML : ''}
            </div>
            <div class="action-list">${actionListHTML}</div>
        `;
        
        setTimeout(() => {
            const changeFactionBtn = row.querySelector('.change-faction-btn');
            const factionSelect = row.querySelector('.player-faction-select');
            
            if (changeFactionBtn) {
                changeFactionBtn.onclick = function() {
                    factionSelect.style.display = 'inline-block';
                    changeFactionBtn.style.display = 'none';
                    factionSelect.focus();
                };
            }
            
            if (factionSelect) {
                const handleFactionChange = function() {
                    const oldFaction = player.faction;
                    const newFaction = factionSelect.value;
                    const playerToUpdate = roomPlayers.find(p => p.id === player.id);
                    if(playerToUpdate) playerToUpdate.faction = newFaction;
                    if (!Array.isArray(nightStates[activeNightIndex].factionChanges)) {
                        nightStates[activeNightIndex].factionChanges = [];
                    }
                    nightStates[activeNightIndex].factionChanges.push({ playerId: player.id, oldFaction, newFaction });
                    saveNightNotes();
                    render();
                };
                factionSelect.onchange = handleFactionChange;
                factionSelect.onblur = function() { 
                    factionSelect.style.display = 'none';
                    changeFactionBtn.style.display = 'inline-block';
                };
            }

            row.querySelectorAll('.remove-action-btn').forEach(btn => {
                btn.onclick = function(e) {
                    const actionId = parseInt(btn.closest('.action-item').dataset.actionId, 10);
                    const nightState = nightStates[activeNightIndex];
                    const actionIndex = nightState.actions.findIndex(a => a.id === actionId);
                    if (actionIndex > -1) {
                        nightState.actions.splice(actionIndex, 1);
                        saveNightNotes();
                        render();
                    }
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        }, 10);
        
        return row;
    }
    
    function buildActionList(playerId, nightState) {
        let html = '';
        if (nightState && Array.isArray(nightState.actions)) {
            nightState.actions.forEach(action => {
                if (action.actorId === playerId) {
                    const target = roomPlayers.find(p => p.id === action.targetId);
                    const actionConfig = ALL_ACTIONS[action.action];
                    const actionLabel = actionConfig?.label || action.action;
                    const actionType = actionConfig?.type || 'custom';
                    html += `
                        <div class="action-item" data-action-id="${action.id}">
                            <i class="fas fa-arrow-right"></i>
                            <span class="action-type-${actionType}">${actionLabel}</span>
                            <span class="target-name">${target?.name || 'Không rõ'}</span>
                            <button class="remove-action-btn" title="Xóa">&times;</button>
                        </div>`;
                }
            });
        }
        return html;
    }

    const renderNightTabs = () => {
        nightTabsContainer.innerHTML = '';
        nightStates.forEach((_, index) => {
            const tab = document.createElement('button');
            tab.className = 'night-tab';
            if (index === activeNightIndex) tab.classList.add('active');
            tab.textContent = `Đêm ${index + 1}`;
            tab.dataset.index = index;
            nightTabsContainer.appendChild(tab);
        });
    };

    const handleEvents = (e) => {
        const target = e.target;
        if (target.closest('#add-night-btn')) {
            const lastNight = nightStates[nightStates.length - 1];
            if (lastNight && !lastNight.isFinished) {
                alert(`Vui lòng kết thúc Đêm ${nightStates.length} trước khi thêm đêm mới.`);
                return;
            }
            const prevStatus = lastNight ? calculateNightStatus(lastNight).finalStatus : Object.fromEntries(roomPlayers.map(p => [p.id, { isAlive: true, isDisabled: false }]));
            const initialStatusForNewNight = JSON.parse(JSON.stringify(prevStatus));
            nightStates.push({
                actions: [],
                playersStatus: prevStatus,
                initialPlayersStatus: initialStatusForNewNight,
                isFinished: false,
                gmNote: ""
            });
            activeNightIndex = nightStates.length - 1;
            saveNightNotes();
            render();
            return;
        }
        const nightState = nightStates[activeNightIndex];
        if (!nightState) return;
        if (target.closest('.night-tab')) {
            activeNightIndex = parseInt(target.closest('.night-tab').dataset.index, 10);
            render();
        } else if (target.closest('#reset-night-btn')) {
            if (confirm(`Bạn có chắc muốn làm mới mọi hành động và trạng thái Sống/Chết trong Đêm ${activeNightIndex + 1}?`)) {
                nightState.actions = [];
                nightState.isFinished = false;
                nightState.playersStatus = JSON.parse(JSON.stringify(nightState.initialPlayersStatus));
                saveNightNotes();
                render();
            }
        } else if (target.closest('#end-night-btn')) {
            if (!nightState.isFinished && confirm(`Bạn có chắc muốn kết thúc Đêm ${activeNightIndex + 1}?`)) {
                nightState.isFinished = true;
                saveNightNotes();
                render();
            }
        } else {
            const row = target.closest('.player-row');
            if (row && !nightState.isFinished) {
                const actorId = row.dataset.playerId;
                if (target.closest('.add-action-btn')) {
                    const actionKey = row.querySelector('.action-select').value;
                    const targetId = row.querySelector('.target-select').value;
                    if (actionKey && targetId) {
                        nightState.actions.push({ id: nextActionId++, actorId, action: actionKey, targetId });
                        saveNightNotes();
                        render();
                    }
                } else if (target.closest('.status-btn.life')) {
                    nightState.playersStatus[actorId].isAlive = !nightState.playersStatus[actorId].isAlive;
                    saveNightNotes();
                    render();
                } else if (target.closest('.status-btn.disable')) {
                    nightState.playersStatus[actorId].isDisabled = !nightState.playersStatus[actorId].isDisabled;
                    saveNightNotes();
                    render();
                }
            }
        }
    };

    const initialize = async (_roomId) => {
        roomId = _roomId;
        roomIdDisplay.textContent = roomId;
        await fetchAllRolesData();
        const roomRef = database.ref(`rooms/${roomId}`);
        
        roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            if(!roomData) return;

            const playersData = roomData.players || {};
            
            roomPlayers = Object.keys(playersData).map(key => {
                const originalData = playersData[key];
                const roleName = (originalData.roleName || '').trim();
                const roleInfo = allRolesData[roleName] || { faction: 'Chưa phân loại', active: '0', kind: 'empty' };
                
                return { 
                    id: key, 
                    ...originalData, 
                    faction: roleInfo.faction,
                    activeRule: roleInfo.active,
                    kind: roleInfo.kind
                };
            });

            const notes = roomData.nightNotes;
            if (notes && Array.isArray(notes)) {
                nightStates = notes;
                nextActionId = Math.max(0, ...notes.flatMap(n => n.actions || []).map(a => a.id)) + 1;
            } else if (roomPlayers.length > 0 && nightStates.length === 0) {
                 const initialStatus = Object.fromEntries(roomPlayers.map(p => [p.id, { isAlive: p.isAlive, isDisabled: false }]));
                 nightStates.push({
                    actions: [],
                    playersStatus: initialStatus,
                    initialPlayersStatus: JSON.parse(JSON.stringify(initialStatus)),
                    isFinished: false,
                    gmNote: ""
                });
                activeNightIndex = 0;
                saveNightNotes();
            }
            render();
        });

        document.addEventListener('click', handleEvents);
    };

    const urlRoomId = new URLSearchParams(window.location.search).get('roomId');
    if (urlRoomId) {
        initialize(urlRoomId);
    } else {
        document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng trong URL.</h1>';
    }
});