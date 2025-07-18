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
        "Phe Dân",
        "Phe Trung Lập",
        "Chức năng khác",
        "Chưa phân loại"
    ];
    const ACTIONS_CONFIG = {
        "Bầy Sói": { className: "optgroup-wolf", actions: { 'wolf_bite_group': { label: 'Sói cắn (nhiều mục tiêu)', type: 'damage', uses: Infinity } } },
        "Phe Dân": { className: "", actions: { 'protect': { label: 'Bảo vệ', type: 'defense', uses: Infinity }, 'save': { label: 'Cứu', type: 'defense', uses: 1 } } },
        "Chức năng khác": { className: "", actions: { 'villager_dmg': { label: 'ST Dân', type: 'damage', uses: 1 }, 'other_dmg': { label: 'ST Khác', type: 'damage', uses: Infinity }, 'armor': { label: 'Giáp', type: 'defense', uses: 1 } } }
    };
    // Đổi key Sói cắn
    const ALL_ACTIONS = Object.values(ACTIONS_CONFIG).reduce((acc, group) => ({ ...acc, ...group.actions }), {});

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
            if (nightState.playersStatus[actorId]?.isDisabled) return;
            if (!statuses[targetId]) return;
            const config = ALL_ACTIONS[action];
            if (config.type === 'damage') statuses[targetId].damage++;
            else if (config.type === 'defense') {
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
        if (!nightState || !Array.isArray(nightState.actions) || nightState.actions.length === 0)
            return "<em>Chưa có hành động nào trong đêm này.</em>";
        let result = "";
        nightState.actions.forEach(({ action, targetId, actorId }) => {
            const actor = roomPlayers.find(p => p.id === actorId);
            const target = roomPlayers.find(p => p.id === targetId);
            let actorName = actor ? actor.name : "???";
            let actorRole = actor && actor.roleName ? actor.roleName : "";
            let targetName = target ? target.name : "???";
            let targetRole = target && target.roleName ? target.roleName : "";
            let text = `${actorName}${actorRole ? " ("+actorRole+")" : ""} chọn ${ALL_ACTIONS[action].label} ${targetName}${targetRole ? " ("+targetRole+")" : ""}`;
            result += `<div class="night-action-summary-item">${text}</div>`;
        });
        return result;
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

        // --- Render player table ---
        const groupedPlayers = roomPlayers.reduce((acc, player) => {
            const faction = player.faction || 'Chưa phân loại';
            if (!acc[faction]) acc[faction] = [];
            acc[faction].push(player);
            return acc;
        }, {});
        const sortedFactions = Object.keys(groupedPlayers).sort((a, b) => {
            const aIsWolf = a.toLowerCase().includes('sói');
            const bIsWolf = b.toLowerCase().includes('sói');
            if (aIsWolf && !bIsWolf) return -1;
            if (!aIsWolf && bIsWolf) return 1;
            return a.localeCompare(b);
        });

        // --- Bầy Sói: gom hành động cắn ---
        if (groupedPlayers['Bầy Sói'] && groupedPlayers['Bầy Sói'].length > 0) {
            const factionName = 'Bầy Sói';
            const playersInFaction = groupedPlayers[factionName];
            const header = document.createElement('div');
            header.className = 'faction-header faction-wolf';
            header.textContent = factionName;
            interactionTable.appendChild(header);

            // Cộng một dòng đặc biệt cho hành động cắn chung
            const wolfRow = document.createElement('div');
            wolfRow.className = 'player-row wolf-bite-group-row';
            wolfRow.innerHTML = `
                <div class="player-header">
                    <div class="player-info"><div class="player-name">Bầy Sói</div></div>
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
            // Hiển thị danh sách các hành động sói cắn chung
            const wolfActionListDiv = wolfRow.querySelector('.wolf-bite-group-list');
            if (nightStates[activeNightIndex] && Array.isArray(nightStates[activeNightIndex].actions)) {
                nightStates[activeNightIndex].actions.forEach(action => {
                    if (action.action === 'wolf_bite_group') {
                        const target = roomPlayers.find(p => p.id === action.targetId);
                        wolfActionListDiv.innerHTML += `<div class="action-item" data-action-id="${action.id}"><i class="fas fa-arrow-right"></i><span class="action-type-damage">Sói cắn</span><span class="target-name">${target?.name || 'Không rõ'}</span><button class="remove-action-btn" title="Xóa">&times;</button></div>`;
                    }
                });
            }
            interactionTable.appendChild(wolfRow);

            playersInFaction.sort((a, b) => a.name.localeCompare(b.name)).forEach(player => {
                const playerState = nightState ? nightState.playersStatus[player.id] : { isAlive: player.isAlive, isDisabled: false };
                const lStatus = nightState ? liveStatuses[player.id] : null;
                interactionTable.appendChild(createPlayerRow(player, playerState, lStatus, nightState ? nightState.isFinished : false));
            });
        }

        // Các phe còn lại
        sortedFactions.filter(f => f !== 'Bầy Sói').forEach(factionName => {
            const playersInFaction = groupedPlayers[factionName];
            const header = document.createElement('div');
            header.className = 'faction-header';
            if (factionName.toLowerCase().includes('sói')) header.classList.add('faction-wolf');
            else if (factionName.toLowerCase().includes('trung lập')) header.classList.add('faction-neutral');
            header.textContent = factionName;
            interactionTable.appendChild(header);

            playersInFaction.sort((a, b) => a.name.localeCompare(b.name)).forEach(player => {
                const playerState = nightState ? nightState.playersStatus[player.id] : { isAlive: player.isAlive, isDisabled: false };
                const lStatus = nightState ? liveStatuses[player.id] : null;
                interactionTable.appendChild(createPlayerRow(player, playerState, lStatus, nightState ? nightState.isFinished : false));
            });
        });

        renderNightTabs();

        // --- Night action summary ---
        if (!nightActionSummaryDiv) {
            nightActionSummaryDiv = document.createElement('div');
            nightActionSummaryDiv.id = "night-action-summary";
            nightActionSummaryDiv.style.margin = "15px 0 0 0";
            nightActionSummaryDiv.style.padding = "12px";
            nightActionSummaryDiv.style.background = "#21262c";
            nightActionSummaryDiv.style.borderRadius = "10px";
            nightActionSummaryDiv.style.fontSize = "1rem";
            nightActionSummaryDiv.style.boxShadow = "0 0 6px #2223";
            nightResultsDiv.parentNode.insertBefore(nightActionSummaryDiv, nightResultsDiv.nextSibling);
        }
        nightActionSummaryDiv.style.display = "block";
        nightActionSummaryDiv.innerHTML = `<div style="font-weight:700; color:#58a6ff; margin-bottom:8px;">Tất cả hành động trong đêm:</div>${buildNightActionSummary(nightState)}`;

        // --- GM Note ---
        if (!gmNoteArea) {
            gmNoteArea = document.createElement('textarea');
            gmNoteArea.id = "gm-night-note";
            gmNoteArea.rows = 2;
            gmNoteArea.style.width = "100%";
            gmNoteArea.style.margin = "12px 0 5px 0";
            gmNoteArea.style.padding = "8px";
            gmNoteArea.style.background = "#21262c";
            gmNoteArea.style.border = "1px solid #30363d";
            gmNoteArea.style.borderRadius = "8px";
            gmNoteArea.style.fontSize = "1rem";
            gmNoteArea.style.color = "#c9d1d9";
            gmNoteArea.placeholder = "Ghi chú của quản trò cho đêm này...";
            nightResultsDiv.parentNode.insertBefore(gmNoteArea, nightActionSummaryDiv.nextSibling);
        }
        if (!gmNoteBtn) {
            gmNoteBtn = document.createElement('button');
            gmNoteBtn.id = "save-gm-night-note-btn";
            gmNoteBtn.textContent = "Lưu ghi chú đêm";
            gmNoteBtn.className = "btn-end-night";
            gmNoteBtn.style.marginBottom = "12px";
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

        // --- Nút xóa night note ---
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

        // --- Kết quả đêm ---
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

        // --- Event cho wolf-bite-group-btn ---
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

        // --- Event xóa hành động sói cắn ---
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

    // --- Màu sắc trạng thái đêm + Button chuyển phe ---
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

        // Button chuyển phe
        let factionSelectHTML = `<select class="player-faction-select" style="background:#21262c; color:#c9d1d9; border-radius:7px; margin-left:8px;">${FACTIONS.map(f => `<option value="${f}"${player.faction===f?' selected':''}>${f}</option>`).join('')}</select>`;
        let changeFactionBtnHTML = `<button class="change-faction-btn" style="margin-left:8px; background:#484f58; color:#fff; border-radius:6px; padding:4px 8px; font-size:0.96rem;">Chuyển phe</button>`;

        let optionsHTML = '';
        for (const groupName in ACTIONS_CONFIG) {
            // Chỉ render cho các phe KHÁC Bầy Sói
            if (groupName === "Bầy Sói") continue;
            const group = ACTIONS_CONFIG[groupName];
            optionsHTML += `<optgroup label="${groupName}" class="${group.className}">`;
            for (const actionKey in group.actions) {
                const action = group.actions[actionKey];
                const remainingUses = player.actionUses[actionKey];
                const isDisabled = remainingUses === 0 || playerState.isDisabled;
                const label = isDisabled ? `${action.label} (hết lượt)` : action.label;
                optionsHTML += `<option value="${actionKey}" ${isDisabled ? 'disabled' : ''}>${label}</option>`;
            }
            optionsHTML += `</optgroup>`;
        }
        const livingPlayers = roomPlayers.filter(p => (nightStates[activeNightIndex] ? nightStates[activeNightIndex].playersStatus[p.id]?.isAlive : p.isAlive));
        const actionControlsHTML = `<div class="action-controls"><select class="action-select"><option value="">-- Chọn hành động --</option>${optionsHTML}</select><select class="target-select"><option value="">-- Chọn mục tiêu --</option>${livingPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select><button class="add-action-btn" title="Thêm hành động"><i class="fas fa-plus"></i></button></div>`;
        let actionListHTML = '<div class="action-list">';
        if (nightStates[activeNightIndex] && Array.isArray(nightStates[activeNightIndex].actions)) {
            nightStates[activeNightIndex].actions.forEach(action => {
                if (action.actorId === player.id) {
                    const target = roomPlayers.find(p => p.id === action.targetId);
                    actionListHTML += `<div class="action-item" data-action-id="${action.id}"><i class="fas fa-arrow-right"></i><span class="action-type-${ALL_ACTIONS[action.action]?.type||'custom'}">${ALL_ACTIONS[action.action]?.label||action.action}</span><span class="target-name">${target?.name || 'Không rõ'}</span><button class="remove-action-btn" title="Xóa">&times;</button></div>`;
                }
            });
        }
        actionListHTML += '</div>';
        row.innerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-role">${player.roleName || 'Chưa có vai'}</div>
                    ${changeFactionBtnHTML}
                    ${factionSelectHTML}
                </div>
                <div class="player-status-controls">
                    <button class="status-btn life ${playerState.isAlive ? 'alive' : 'dead'}" title="Sống/Chết"><i class="fas fa-heart"></i></button>
                    <button class="status-btn disable ${playerState.isDisabled ? 'disabled' : 'enabled'}" title="${playerState.isDisabled ? 'Bật lại chức năng' : 'Vô hiệu hóa'}"><i class="fas fa-user-slash"></i></button>
                    ${playerState.isDisabled ? '<span class="disable-label">VÔ HIỆU</span>' : ''}
                </div>
                ${(playerState.isAlive && !isFinished && nightStates[activeNightIndex] && !playerState.isDisabled && player.faction !== 'Bầy Sói') ? actionControlsHTML : ''}
            </div>
            ${actionListHTML}
        `;

        // Event chuyển phe
        setTimeout(() => {
            const btn = row.querySelector('.change-faction-btn');
            const select = row.querySelector('.player-faction-select');
            btn.onclick = function() {
                select.style.display = 'inline-block';
                select.focus();
            };
            select.onchange = function() {
                player.faction = select.value;
                saveNightNotes();
                render();
            };
        }, 10);

        // Event xóa hành động của người chơi
        setTimeout(() => {
            row.querySelectorAll('.remove-action-btn').forEach(btn => {
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
        }, 10);

        return row;
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

    // --- Event Handlers ---
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
                const actor = roomPlayers.find(p => p.id === actorId);
                if (target.closest('.add-action-btn')) {
                    const actionKey = row.querySelector('.action-select').value;
                    const targetId = row.querySelector('.target-select').value;
                    if (actionKey && targetId) {
                        if (typeof actor.actionUses[actionKey] === 'number') {
                            actor.actionUses[actionKey]--;
                        }
                        nightState.actions.push({ id: nextActionId++, actorId, action: actionKey, targetId });
                        saveNightNotes();
                        render();
                    }
                } else if (target.closest('.remove-action-btn')) {
                    const actionId = parseInt(target.closest('.action-item').dataset.actionId, 10);
                    const actionIndex = nightState.actions.findIndex(a => a.id === actionId);
                    if (actionIndex > -1) {
                        const actionToRestore = nightState.actions[actionIndex];
                        const player = roomPlayers.find(p => p.id === actionToRestore.actorId);
                        if (player && typeof player.actionUses[actionToRestore.action] === 'number') {
                            player.actionUses[actionToRestore.action]++;
                        }
                        nightState.actions.splice(actionIndex, 1);
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
        database.ref(`rooms/${roomId}/nightNotes`).once('value', (snapshot) => {
            const notes = snapshot.val();
            if (notes && Array.isArray(notes)) {
                nightStates = notes;
            }
        }).then(() => {
            const roomRef = database.ref(`rooms/${roomId}/players`);
            roomRef.once('value', (snapshot) => {
                const playersData = snapshot.val();
                if (playersData) {
                    roomPlayers = Object.keys(playersData).map(key => {
                        const originalData = playersData[key];
                        const roleName = (originalData.roleName || '').trim();
                        const player = { id: key, ...originalData, faction: allRolesData[roleName] || 'Chưa phân loại', actionUses: {} };
                        for (const actionKey in ALL_ACTIONS) {
                            player.actionUses[actionKey] = ALL_ACTIONS[actionKey].uses;
                        }
                        return player;
                    });
                    document.addEventListener('click', handleEvents);
                    render();
                } else {
                    interactionTable.innerHTML = '<p>Không tìm thấy dữ liệu người chơi trong phòng này.</p>';
                }
            }, (error) => {
                console.error(error);
                interactionTable.innerHTML = '<p>Lỗi khi tải dữ liệu phòng từ Firebase.</p>';
            });
        });
    };

    const urlRoomId = new URLSearchParams(window.location.search).get('roomId');
    if (urlRoomId) {
        initialize(urlRoomId);
    } else {
        document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng trong URL.</h1>';
    }
});