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
        "Bầy Sói": {
            className: "optgroup-wolf",
            actions: {
                'wolf_bite': { label: 'Sói cắn', type: 'damage', uses: Infinity },
                'wolf_dmg': { label: 'ST Sói', type: 'damage', uses: 1 },
            }
        },
        "Phe Dân": {
            className: "",
            actions: {
                'protect': { label: 'Bảo vệ', type: 'defense', uses: Infinity },
                'save': { label: 'Cứu', type: 'defense', uses: 1 },
            }
        },
        "Chức năng khác": {
            className: "",
            actions: {
                'villager_dmg': { label: 'ST Dân', type: 'damage', uses: 1 },
                'other_dmg': { label: 'ST Khác', type: 'damage', uses: Infinity },
                'armor': { label: 'Giáp', type: 'defense', uses: 1 },
            }
        }
    };
    
    const ALL_ACTIONS = Object.values(ACTIONS_CONFIG).reduce((acc, group) => ({ ...acc, ...group.actions }), {});

    // --- State ---
    let roomPlayers = [];
    let allRolesData = {}; // **BIẾN MỚI: LƯU DỮ LIỆU TỪ SHEET ROLES**
    let nightStates = [];
    let activeNightIndex = 0;
    let nextActionId = 0;

    // **HÀM MỚI: TẢI DỮ LIỆU ROLES TỪ GOOGLE SHEET (GIỐNG HỆT player.js)**
    const fetchAllRolesData = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải dữ liệu vai trò.');
            const rawData = await response.json();
            // Tạo bản đồ tra cứu từ Role -> Faction
            allRolesData = rawData.reduce((acc, role) => {
                const roleName = (role.Role || '').trim();
                const faction = (role.Faction || 'Chưa phân loại').trim();
                if (roleName) {
                    acc[roleName] = faction;
                }
                return acc;
            }, {});
        } catch (error) {
            console.error("Lỗi nghiêm trọng khi tải dữ liệu vai trò:", error);
            interactionTable.innerHTML = `<p style="color:red;">Lỗi: Không thể tải dữ liệu vai trò từ Google Sheet. Vui lòng kiểm tra lại.</p>`;
        }
    };

    // --- Logic ---
    const calculateNightStatus = (nightState) => {
        const statuses = {};
        const finalStatus = JSON.parse(JSON.stringify(nightState.playersStatus));
        const alivePlayerIds = Object.keys(finalStatus).filter(pId => finalStatus[pId].isAlive);

        alivePlayerIds.forEach(pId => {
            statuses[pId] = { damage: 0, isProtected: false, isHealed: false, hasArmor: false, isInDanger: false, isDead: false };
        });

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
        return { liveStatuses: statuses, finalStatus: finalStatus, deadPlayerNames };
    };
    
    // --- Rendering ---
    const render = () => {
        const nightState = nightStates[activeNightIndex];
        if (!nightState) {
            interactionTable.innerHTML = '<p>Hãy thêm một đêm để bắt đầu.</p>';
            return;
        }

        const { liveStatuses, deadPlayerNames } = calculateNightStatus(nightState);
        interactionTable.innerHTML = '';

        const groupedPlayers = roomPlayers.reduce((acc, player) => {
            const faction = player.faction || 'Chưa phân loại'; 
            if (!acc[faction]) {
                acc[faction] = [];
            }
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
            
            if (factionName.toLowerCase().includes('sói')) {
                header.classList.add('faction-wolf');
            } else if (factionName.toLowerCase().includes('trung lập')) {
                header.classList.add('faction-neutral');
            }
            header.textContent = factionName;
            interactionTable.appendChild(header);

            playersInFaction.sort((a,b) => a.name.localeCompare(b.name)).forEach(player => {
                const playerState = nightState.playersStatus[player.id];
                if (!playerState) return;
                interactionTable.appendChild(createPlayerRow(player, playerState, liveStatuses[player.id], nightState.isFinished));
            });
        });

        renderNightTabs();
        if (nightState.isFinished) {
            if (deadPlayerNames.length > 0) {
                nightResultsDiv.innerHTML = `<strong>Đã chết:</strong> ${deadPlayerNames.map(name => `<span class="dead-player">${name}</span>`).join(', ')}`;
            } else {
                nightResultsDiv.innerHTML = '<p>Không có ai chết trong đêm nay.</p>';
            }
        } else {
            nightResultsDiv.innerHTML = '<p>Đang chờ kết quả...</p>';
        }
    };

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

        const livingPlayers = roomPlayers.filter(p => nightStates[activeNightIndex].playersStatus[p.id]?.isAlive);
        const actionControlsHTML = `
            <div class="action-controls">
                <select class="action-select">
                    <option value="">-- Chọn hành động --</option>
                    ${optionsHTML}
                </select>
                <select class="target-select">
                    <option value="">-- Chọn mục tiêu --</option>
                    ${livingPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
                <button class="add-action-btn" title="Thêm hành động"><i class="fas fa-plus"></i></button>
            </div>`;

        let actionListHTML = '<div class="action-list">';
        nightStates[activeNightIndex].actions.forEach(action => {
            if (action.actorId === player.id) {
                const target = roomPlayers.find(p => p.id === action.targetId);
                actionListHTML += `
                    <div class="action-item" data-action-id="${action.id}">
                        <i class="fas fa-arrow-right"></i>
                        <span class="action-type-${ALL_ACTIONS[action.action].type}">${ALL_ACTIONS[action.action].label}</span>
                        <span class="target-name">${target?.name || 'Không rõ'}</span>
                        <button class="remove-action-btn" title="Xóa">&times;</button>
                    </div>`;
            }
        });
        actionListHTML += '</div>';

        row.innerHTML = `
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-role">${player.roleName || 'Chưa có vai'}</div>
                </div>
                <div class="player-status-controls">
                    <button class="status-btn life ${playerState.isAlive ? 'alive' : 'dead'}" title="Sống/Chết"><i class="fas fa-heart"></i></button>
                </div>
                ${playerState.isAlive && !isFinished ? actionControlsHTML : ''}
            </div>
            ${actionListHTML}`;
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
        if (!nightStates[activeNightIndex] && !target.closest('#add-night-btn')) return;
        const nightState = nightStates[activeNightIndex];

        if (target.closest('.night-tab')) {
            activeNightIndex = parseInt(target.closest('.night-tab').dataset.index, 10);
            render();
            return;
        }

        if (target.closest('#add-night-btn')) {
            const lastNight = nightStates[nightStates.length - 1];
            if (lastNight && !lastNight.isFinished) {
                alert(`Vui lòng kết thúc Đêm ${nightStates.length} trước khi thêm đêm mới.`);
                return;
            }
            const { finalStatus } = lastNight ? calculateNightStatus(lastNight) : { finalStatus: null };
            const newPlayersStatus = finalStatus ? finalStatus : 
                Object.fromEntries(roomPlayers.map(p => [p.id, { isAlive: true }]));
            nightStates.push({ actions: [], playersStatus: newPlayersStatus, isFinished: false });
            activeNightIndex = nightStates.length - 1;
            render();
            return;
        }

        if (target.closest('#reset-night-btn')) {
             if (nightState && confirm(`Bạn có chắc muốn làm mới mọi hành động trong Đêm ${activeNightIndex + 1}?`)) {
                nightState.actions.forEach(actionToReset => {
                    const player = roomPlayers.find(p => p.id === actionToReset.actorId);
                    if (player && typeof player.actionUses[actionToReset.action] === 'number') {
                         player.actionUses[actionToReset.action]++;
                    }
                });
                nightState.actions = [];
                nightState.isFinished = false;
                render();
            }
            return;
        }

        if (target.closest('#end-night-btn')) {
            if (nightState && !nightState.isFinished) {
                if (confirm(`Bạn có chắc muốn kết thúc Đêm ${activeNightIndex + 1}? Hành động này không thể hoàn tác.`)) {
                    nightState.isFinished = true;
                    render();
                }
            }
            return;
        }

        const row = target.closest('.player-row');
        if (row) {
            const actorId = row.dataset.playerId;
            if (!nightState || nightState.isFinished) return;
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
                    if (typeof actor.actionUses[actionToRestore.action] === 'number') {
                         actor.actionUses[actionToRestore.action]++;
                    }
                    nightState.actions.splice(actionIndex, 1);
                    render();
                }
            } else if (target.closest('.status-btn.life')) {
                nightState.playersStatus[actorId].isAlive = !nightState.playersStatus[actorId].isAlive;
                render();
            }
        }
    };
    
    // --- Initialization ---
    const initialize = async (roomId) => {
        roomIdDisplay.textContent = roomId;
        // **BƯỚC 1: Tải dữ liệu phe phái TRƯỚC TIÊN**
        await fetchAllRolesData();

        // **BƯỚC 2: Tải dữ liệu người chơi từ Firebase**
        const roomRef = database.ref(`rooms/${roomId}/players`);
        roomRef.once('value', (snapshot) => {
            const playersData = snapshot.val();
            if (playersData) {
                roomPlayers = Object.keys(playersData).map(key => {
                    const originalData = playersData[key];
                    const roleName = (originalData.roleName || '').trim();
                    
                    // **BƯỚC 3: Kết hợp dữ liệu**
                    const player = { 
                        id: key, 
                        ...originalData, 
                        // Dùng bản đồ tra cứu `allRolesData` để lấy phe phái
                        faction: allRolesData[roleName] || 'Chưa phân loại', 
                        actionUses: {} 
                    };
                    for (const actionKey in ALL_ACTIONS) {
                        player.actionUses[actionKey] = ALL_ACTIONS[actionKey].uses;
                    }
                    return player;
                });

                document.addEventListener('click', handleEvents);
                const initialStatus = Object.fromEntries(roomPlayers.map(p => [p.id, { isAlive: true }]));
                nightStates.push({ actions: [], playersStatus: initialStatus, isFinished: false });
                render(); // Bây giờ `render` đã có đủ dữ liệu để phân loại
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