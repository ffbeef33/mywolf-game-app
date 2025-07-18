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
    let gmNoteArea, gmNoteBtn, nightActionSummaryDiv;

    // --- Config ---
    const FACTIONS = ["Bầy Sói", "Phe Sói", "Phe Dân", "Phe trung lập", "Chức năng khác", "Chưa phân loại"];
    const FACTION_GROUPS = [
        { display: 'Bầy Sói', factions: ['Bầy Sói'], className: 'faction-wolf' },
        { display: 'Phe Sói', factions: ['Phe Sói'], className: 'faction-wolf' },
        { display: 'Phe Dân', factions: ['Phe Dân'], className: 'faction-villager' },
        { display: 'Phe trung lập', factions: ['Phe trung lập'], className: 'faction-neutral' },
        { display: 'Khác', factions: ['Chức năng khác', 'Chưa phân loại'], className: 'faction-other' }
    ];
    const SELECTABLE_FACTIONS = ["Bầy Sói", "Phe Sói", "Phe Dân", "Phe trung lập"];

    // Cấu hình hành động theo VAI TRÒ
    const ROLE_ACTIONS_CONFIG = {
        // --- Ví dụ cho các vai trò có hành động ---
        "Bảo vệ": { actions: { 'protect': { label: 'Bảo vệ', type: 'defense', uses: Infinity } } },
        "Tiên tri": { actions: { 'seer_check': { label: 'Soi', type: 'info', uses: Infinity } } },
        "Phù thủy": { actions: { 'potion_heal': { label: 'Cứu', type: 'defense', uses: 1 }, 'potion_kill': { label: 'Giết', type: 'damage', uses: 1 } } },
        // "Sói sát thủ": { actions: { 'assassinate': { label: 'Ám sát', type: 'damage', uses: 1 } } },
        // Thêm các vai trò khác có hành động ở đây
    };
    // Tạo một danh sách tổng hợp tất cả các hành động có thể có
    const ALL_ACTIONS = Object.values(ROLE_ACTIONS_CONFIG).reduce((acc, role) => ({ ...acc, ...role.actions }), {});
    // Thêm hành động cắn chung của bầy sói vào để có label
    ALL_ACTIONS['wolf_bite_group'] = { label: 'Sói cắn', type: 'damage' };


    // --- State ---
    let roomPlayers = [], allRolesData = {}, nightStates = [], activeNightIndex = 0, nextActionId = 0, roomId = null;

    // --- Data Fetching ---
    const fetchAllRolesData = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải dữ liệu vai trò.');
            const rawData = await response.json();
            allRolesData = rawData.reduce((acc, role) => {
                const roleName = (role.RoleName || '').trim();
                if (roleName) acc[roleName] = (role.Faction || 'Chưa phân loại').trim();
                return acc;
            }, {});
        } catch (error) {
            console.error("Lỗi tải dữ liệu vai trò:", error);
            interactionTable.innerHTML = `<p style="color:red;">Lỗi: Không thể tải dữ liệu vai trò từ Google Sheet.</p>`;
        }
    };

    function saveNightNotes() {
        if (roomId) database.ref(`rooms/${roomId}/nightNotes`).set(nightStates);
    }

    // --- Logic ---
    const calculateNightStatus = (nightState) => {
        if (!nightState) return { liveStatuses: {}, finalStatus: {}, deadPlayerNames: [] };
        if (!Array.isArray(nightState.actions)) nightState.actions = [];
        const statuses = {};
        const finalStatus = JSON.parse(JSON.stringify(nightState.playersStatus));
        const alivePlayerIds = Object.keys(finalStatus).filter(pId => finalStatus[pId].isAlive);
        alivePlayerIds.forEach(pId => { statuses[pId] = { damage: 0, isProtected: false, isHealed: false, hasArmor: false, isInDanger: false, isDead: false }; });
        nightState.actions.forEach(({ action, targetId, actorId }) => {
            if (actorId !== 'wolf_group' && nightState.playersStatus[actorId]?.isDisabled) return;
            if (!statuses[targetId]) return;
            const config = ALL_ACTIONS[action];
            if (config?.type === 'damage') statuses[targetId].damage++;
            else if (config?.type === 'defense') {
                if (action === 'protect') statuses[targetId].isProtected = true;
                if (action === 'save') statuses[targetId].isHealed = true;
                if (action === 'armor') statuses[targetId].hasArmor = true;
            }
        });
        let deadPlayerNames = [];
        alivePlayerIds.forEach(pId => {
            const playerStatus = statuses[pId];
            if (playerStatus.damage > 0 && !playerStatus.isProtected) playerStatus.isInDanger = true;
            let finalDamage = playerStatus.damage;
            if (playerStatus.isProtected) finalDamage = 0;
            if (playerStatus.hasArmor && finalDamage > 0) finalDamage--;
            if (finalDamage > 0 && !playerStatus.isHealed) {
                playerStatus.isDead = true;
                finalStatus[pId].isAlive = false;
                const playerData = roomPlayers.find(p => p.id === pId);
                if (playerData) deadPlayerNames.push(playerData.name);
            }
        });
        return { liveStatuses: statuses, finalStatus, deadPlayerNames };
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

        document.querySelectorAll('.wolf-bite-group-btn').forEach(btn => {
            btn.onclick = function() {
                const wolfRow = btn.closest('.wolf-bite-group-row');
                const select = wolfRow.querySelector('.wolf-bite-target-select');
                const selectedIds = Array.from(select.selectedOptions).map(opt => opt.value);
                if (selectedIds.length === 0) return;
                selectedIds.forEach(targetId => {
                    nightStates[activeNightIndex].actions.push({
                        id: nextActionId++,
                        actorId: 'wolf_group',
                        action: 'wolf_bite_group',
                        targetId: targetId
                    });
                });
                saveNightNotes();
                render();
            };
        });
        
        document.querySelectorAll('.wolf-bite-group-list .remove-action-btn').forEach(btn => {
            btn.onclick = function(e) {
                const actionId = parseInt(btn.closest('.action-item').dataset.actionId, 10);
                const actionIndex = nightStates[activeNightIndex].actions.findIndex(a => a.id === actionId);
                if (actionIndex > -1) {
                    nightStates[activeNightIndex].actions.splice(actionIndex, 1);
                    saveNightNotes();
                    render();
                }
                e.preventDefault();
                e.stopPropagation();
            }
        });
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
        const playerRoleActionConfig = ROLE_ACTIONS_CONFIG[player.roleName];
        
        if (playerRoleActionConfig && Object.keys(playerRoleActionConfig.actions).length > 0) {
            optionsHTML += `<optgroup label="Hành động ${player.roleName}">`;
            for (const actionKey in playerRoleActionConfig.actions) {
                const action = playerRoleActionConfig.actions[actionKey];
                const isDisabled = playerState.isDisabled;
                optionsHTML += `<option value="${actionKey}" ${isDisabled ? 'disabled' : ''}>${action.label}</option>`;
            }
            optionsHTML += `</optgroup>`;
        }
        
        const livingPlayers = roomPlayers.filter(p => (nightStates[activeNightIndex] ? nightStates[activeNightIndex].playersStatus[p.id]?.isAlive : p.isAlive));
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
                    <div>
                         ${changeFactionBtnHTML}
                         ${factionSelectHTML}
                    </div>
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
                    const actionConfig = ALL_ACTIONS[action.action] || {};
                    const actionLabel = actionConfig.label || action.action;
                    const actionType = actionConfig.type || 'custom';
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
            const prevStatus = lastNight ? calculateNightStatus(lastNight).finalStatus : Object.fromEntries(roomPlayers.map(p => [p.id, { isAlive: p.isAlive, isDisabled: false }]));
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
                nightState.actions.forEach(actionToReset => {
                    const player = roomPlayers.find(p => p.id === actionToReset.actorId);
                    if (player && typeof player.actionUses[actionToReset.action] === 'number') {
                        player.actionUses[actionToReset.action]++;
                    }
                });
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
                return { 
                    id: key, 
                    ...originalData, 
                    faction: allRolesData[roleName] || 'Chưa phân loại'
                };
            });

            const notes = roomData.nightNotes;
            if (notes && Array.isArray(notes)) {
                nightStates = notes;
                nextActionId = Math.max(0, ...notes.flatMap(n => n.actions || []).map(a => a.id)) + 1;
            } else if (roomPlayers.length > 0 && nightStates.length === 0) {
                 // Tự động tạo đêm 1 nếu chưa có
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