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

    // --- Config ---
    const ACTIONS_CONFIG = {
        "Bầy Sói": { className: "optgroup-wolf", actions: { 'wolf_bite': { label: 'Sói cắn', type: 'damage', uses: Infinity }, 'wolf_dmg': { label: 'ST Sói', type: 'damage', uses: 1 } } },
        "Phe Dân": { className: "", actions: { 'protect': { label: 'Bảo vệ', type: 'defense', uses: Infinity }, 'save': { label: 'Cứu', type: 'defense', uses: 1 } } },
        "Chức năng khác": { className: "", actions: { 'villager_dmg': { label: 'ST Dân', type: 'damage', uses: 1 }, 'other_dmg': { label: 'ST Khác', type: 'damage', uses: Infinity }, 'armor': { label: 'Giáp', type: 'defense', uses: 1 } } }
    };
    const ALL_ACTIONS = Object.values(ACTIONS_CONFIG).reduce((acc, group) => ({ ...acc, ...group.actions }), {});

    // --- State ---
    let roomPlayers = [];
    let allRolesData = {};
    let nightStates = [];
    let activeNightIndex = 0;
    let nextActionId = 0;

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

    // --- Logic ---
    const calculateNightStatus = (nightState) => {
        if (!nightState) return { liveStatuses: {}, finalStatus: {}, deadPlayerNames: [] };
        const statuses = {};
        const finalStatus = JSON.parse(JSON.stringify(nightState.playersStatus));
        const alivePlayerIds = Object.keys(finalStatus).filter(pId => finalStatus[pId].isAlive);
        alivePlayerIds.forEach(pId => { statuses[pId] = { damage: 0, isProtected: false, isHealed: false, hasArmor: false, isInDanger: false, isDead: false }; });
        nightState.actions.forEach(({ action, targetId }) => {
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
    
    // --- Rendering ---
    const render = () => {
        interactionTable.innerHTML = '';
        const nightState = nightStates[activeNightIndex];
        const { liveStatuses } = calculateNightStatus(nightState);

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

        sortedFactions.forEach(factionName => {
            const playersInFaction = groupedPlayers[factionName];
            const header = document.createElement('div');
            header.className = 'faction-header';
            if (factionName.toLowerCase().includes('sói')) header.classList.add('faction-wolf');
            else if (factionName.toLowerCase().includes('trung lập')) header.classList.add('faction-neutral');
            header.textContent = factionName;
            interactionTable.appendChild(header);
            
            playersInFaction.sort((a, b) => a.name.localeCompare(b.name)).forEach(player => {
                const playerState = nightState ? nightState.playersStatus[player.id] : { isAlive: player.isAlive };
                const lStatus = nightState ? liveStatuses[player.id] : null;
                if (playerState) interactionTable.appendChild(createPlayerRow(player, playerState, lStatus, nightState ? nightState.isFinished : false));
            });
        });

        renderNightTabs();
        
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

    // --- Sửa đổi: Nút trái tim luôn hiển thị, kể cả khi đã chết ---
    const createPlayerRow = (player, playerState, liveStatus, isFinished) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = player.id;
        if (!playerState.isAlive) row.classList.add('status-dead');
        if (liveStatus) {
            if (liveStatus.isInDanger) row.classList.add('status-danger');
            if (liveStatus.isProtected) row.classList.add('status-protected');
            if (isFinished && liveStatus.isDead) row.classList.add('status-dead-calculated');
        }
        let optionsHTML = '';
        for (const groupName in ACTIONS_CONFIG) {
            const group = ACTIONS_CONFIG[groupName];
            optionsHTML += `<optgroup label="${groupName}" class="${group.className}">`;
            for (const actionKey in group.actions) {
                const action = group.actions[actionKey];
                const remainingUses = player.actionUses[actionKey];
                const isDisabled = remainingUses === 0;
                const label = isDisabled ? `${action.label} (hết lượt)` : action.label;
                optionsHTML += `<option value="${actionKey}" ${isDisabled ? 'disabled' : ''}>${label}</option>`;
            }
            optionsHTML += `</optgroup>`;
        }
        const livingPlayers = roomPlayers.filter(p => (nightStates[activeNightIndex] ? nightStates[activeNightIndex].playersStatus[p.id]?.isAlive : p.isAlive));
        const actionControlsHTML = `<div class="action-controls"><select class="action-select"><option value="">-- Chọn hành động --</option>${optionsHTML}</select><select class="target-select"><option value="">-- Chọn mục tiêu --</option>${livingPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select><button class="add-action-btn" title="Thêm hành động"><i class="fas fa-plus"></i></button></div>`;
        let actionListHTML = '<div class="action-list">';
        if (nightStates[activeNightIndex]) {
            nightStates[activeNightIndex].actions.forEach(action => {
                if (action.actorId === player.id) {
                    const target = roomPlayers.find(p => p.id === action.targetId);
                    actionListHTML += `<div class="action-item" data-action-id="${action.id}"><i class="fas fa-arrow-right"></i><span class="action-type-${ALL_ACTIONS[action.action].type}">${ALL_ACTIONS[action.action].label}</span><span class="target-name">${target?.name || 'Không rõ'}</span><button class="remove-action-btn" title="Xóa">&times;</button></div>`;
                }
            });
        }
        actionListHTML += '</div>';
        // Luôn render player-status-controls (nút trái tim), kể cả khi đã chết
        row.innerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-role">${player.roleName || 'Chưa có vai'}</div>
                </div>
                <div class="player-status-controls">
                    <button class="status-btn life ${playerState.isAlive ? 'alive' : 'dead'}" title="Sống/Chết"><i class="fas fa-heart"></i></button>
                </div>
                ${(playerState.isAlive && !isFinished && nightStates[activeNightIndex]) ? actionControlsHTML : ''}
            </div>
            ${actionListHTML}
        `;
        return row;
    };

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
            const prevStatus = lastNight ? calculateNightStatus(lastNight).finalStatus : Object.fromEntries(roomPlayers.map(p => [p.id, { isAlive: p.isAlive }]));
            const initialStatusForNewNight = JSON.parse(JSON.stringify(prevStatus));
            nightStates.push({
                actions: [],
                playersStatus: prevStatus,
                initialPlayersStatus: initialStatusForNewNight,
                isFinished: false
            });
            activeNightIndex = nightStates.length - 1;
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
                render();
            }
        } else if (target.closest('#end-night-btn')) {
            if (!nightState.isFinished && confirm(`Bạn có chắc muốn kết thúc Đêm ${activeNightIndex + 1}?`)) {
                nightState.isFinished = true;
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
                        render();
                    }
                } else if (target.closest('.status-btn.life')) {
                    nightState.playersStatus[actorId].isAlive = !nightState.playersStatus[actorId].isAlive;
                    render();
                }
            }
        }
    };
    
    // --- Initialization ---
    const initialize = async (roomId) => {
        roomIdDisplay.textContent = roomId;
        await fetchAllRolesData();
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
    };

    const roomId = new URLSearchParams(window.location.search).get('roomId');
    if (roomId) {
        initialize(roomId);
    } else {
        document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng trong URL.</h1>';
    }
});