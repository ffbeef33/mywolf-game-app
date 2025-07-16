document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Configuration ---
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

    // --- DOM Elements ---
    const roomIdDisplay = document.getElementById('room-id-display');
    const interactionTable = document.getElementById('player-interaction-table');
    const nightResultsDiv = document.getElementById('night-results');
    const nightTabsContainer = document.getElementById('night-tabs');
    const addNightBtn = document.getElementById('add-night-btn');

    // --- State Management ---
    let currentRoomId = null;
    let roomPlayers = []; // Dữ liệu gốc từ Firebase
    let nightStates = []; // Mảng lưu trạng thái của tất cả các đêm
    let activeNightIndex = 0; // Đêm hiện tại đang xem

    // --- Core Functions ---
    
    const getRoomIdFromURL = () => new URLSearchParams(window.location.search).get('roomId');

    /**
     * Khởi tạo trạng thái cho một đêm mới.
     * Kế thừa trạng thái isAlive từ đêm trước nếu có.
     */
    const createNewNightState = () => {
        const lastNightState = nightStates.length > 0 ? nightStates[nightStates.length - 1] : null;
        const newNight = {
            players: {}
        };
        roomPlayers.forEach(player => {
            const isAlive = lastNightState ? lastNightState.players[player.id]?.isAlive : true;
            newNight.players[player.id] = {
                id: player.id,
                name: player.name,
                roleName: player.roleName,
                isAlive: isAlive,
                abilityOn: true,
                interactions: {
                    wolf_bite: false,
                    wolf_dmg: false,
                    villager_dmg: false,
                    other_dmg: false,
                    protect: false,
                    save: false,
                    armor: false,
                },
                group: null
            };
        });
        return newNight;
    };

    /**
     * "Bộ não" tính toán kết quả của một đêm
     * @param {object} nightState - Trạng thái của đêm cần tính toán
     * @returns {object} - Trả về trạng thái người chơi đã được tính toán (damage, isDead, isDanger)
     */
    const calculateNightResults = (nightState) => {
        let calculatedPlayers = JSON.parse(JSON.stringify(nightState.players)); // Deep copy để tránh thay đổi state gốc
        let groups = {};

        // 1. Tính toán sát thương và nhóm
        for (const pId in calculatedPlayers) {
            const player = calculatedPlayers[pId];
            if (!player.isAlive) continue;

            // Tính tổng sát thương
            player.damage = 0;
            if (player.interactions.wolf_bite) player.damage++;
            if (player.interactions.wolf_dmg) player.damage++;
            if (player.interactions.villager_dmg) player.damage++;
            if (player.interactions.other_dmg) player.damage++;
            
            // Xử lý giáp: Giáp đỡ được 1 sát thương
            if (player.interactions.armor && player.damage > 0) {
                player.damage--;
            }
            
            // Xử lý bảo vệ: Miễn nhiễm mọi sát thương
            if (player.interactions.protect) {
                player.damage = 0;
            }

            // Gom nhóm
            if (player.group) {
                if (!groups[player.group]) groups[player.group] = [];
                groups[player.group].push(pId);
            }
        }

        // 2. Xử lý sát thương theo nhóm (Cặp đôi...)
        for (const groupId in groups) {
            const memberIds = groups[groupId];
            const totalGroupDamage = memberIds.reduce((sum, pId) => sum + calculatedPlayers[pId].damage, 0);
            
            if (totalGroupDamage > 0) {
                memberIds.forEach(pId => {
                    // Nếu bất kỳ ai trong nhóm nhận sát thương, cả nhóm đều chết (trừ khi được cứu)
                    calculatedPlayers[pId].damage = Math.max(calculatedPlayers[pId].damage, 1);
                });
            }
        }

        // 3. Quyết định trạng thái cuối cùng (isDead, isDanger)
        for (const pId in calculatedPlayers) {
            const player = calculatedPlayers[pId];
            player.isDanger = false;
            player.isDead = false;

            if (player.isAlive && player.damage > 0) {
                 // Nếu nhận sát thương và không được cứu -> Chết
                if (!player.interactions.save) {
                    player.isDead = true;
                }
                // Nếu nhận sát thương (dù được cứu hay không) -> Hiển thị nguy hiểm
                player.isDanger = true;
            }
        }
        return calculatedPlayers;
    };

    /**
     * Cập nhật toàn bộ giao diện dựa trên trạng thái đã tính toán
     * @param {object} calculatedPlayerStates - Kết quả từ hàm calculateNightResults
     */
    const updateUI = (calculatedPlayerStates) => {
        // Cập nhật từng hàng người chơi
        document.querySelectorAll('.player-row').forEach(row => {
            const playerId = row.dataset.playerId;
            const playerState = calculatedPlayerStates[playerId];
            if (!playerState) return;

            row.classList.remove('status-danger', 'status-dead-calculated');
            if (playerState.isDanger) row.classList.add('status-danger');
            if (playerState.isDead) row.classList.add('status-dead-calculated');
        });

        // Cập nhật khu vực kết quả
        const deadPlayers = Object.values(calculatedPlayerStates).filter(p => p.isDead);
        if (deadPlayers.length > 0) {
            nightResultsDiv.innerHTML = '<strong>Sẽ chết:</strong> ' + deadPlayers.map(p => 
                `<span class="dead-player">${p.name}</span>`
            ).join(', ');
        } else {
            nightResultsDiv.innerHTML = '<p>Chưa có ai chết...</p>';
        }
    };
    
    /**
     * Hàm trung tâm xử lý mọi tương tác và gọi các hàm tính toán, cập nhật UI
     */
    const processInteractions = () => {
        const activeNight = nightStates[activeNightIndex];
        if (!activeNight) return;
        const calculatedStates = calculateNightResults(activeNight);
        updateUI(calculatedStates);
    };

    // --- UI Rendering Functions ---

    const createPlayerRow = (playerState) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        row.dataset.playerId = playerState.id;
        if (!playerState.isAlive) {
            row.classList.add('status-dead');
        }

        // Tối ưu hóa việc tạo HTML
        row.innerHTML = `
            <div class="player-info">
                <div class="player-name">${playerState.name}</div>
                <div class="player-role">${playerState.roleName || 'Chưa có vai'}</div>
            </div>
            <div class="player-status-controls">
                <button class="status-btn life ${playerState.isAlive ? 'active alive' : 'dead'}" data-status="life" title="Đánh dấu Sống/Chết"><i class="fas fa-heart"></i></button>
                <button class="status-btn ability ${playerState.abilityOn ? 'active ability-on' : 'ability-off'}" data-status="ability" title="Đánh dấu Chức năng còn/mất"><i class="fas fa-star"></i></button>
            </div>
            <div class="interaction-group">
                ${Object.keys(playerState.interactions).map(action => `
                    <label class="checkbox-label" title="${action.replace('_', ' ')}">
                        <input type="checkbox" data-action="${action}" ${playerState.interactions[action] ? 'checked' : ''}> ${action.charAt(0).toUpperCase() + action.slice(1).replace('_', ' ')}
                    </label>
                `).join('')}
            </div>
            <div class="grouping-control">
                <input type="number" min="1" placeholder="Nhóm" title="Nhập số nhóm" value="${playerState.group || ''}">
            </div>
        `;
        return row;
    };

    const renderNight = (nightIndex) => {
        activeNightIndex = nightIndex;
        const nightState = nightStates[nightIndex];
        if (!nightState) return;

        interactionTable.innerHTML = '';
        Object.values(nightState.players).forEach(playerState => {
            const playerRow = createPlayerRow(playerState);
            interactionTable.appendChild(playerRow);
        });

        // Cập nhật lại trạng thái active cho các tab
        document.querySelectorAll('.night-tab').forEach((tab, index) => {
            tab.classList.toggle('active', index === activeNightIndex);
        });

        processInteractions(); // Tính toán và hiển thị kết quả cho đêm vừa được render
    };

    const renderNightTabs = () => {
        nightTabsContainer.innerHTML = '';
        nightStates.forEach((_, index) => {
            const tab = document.createElement('button');
            tab.className = 'night-tab';
            tab.textContent = `Đêm ${index + 1}`;
            tab.dataset.index = index;
            if (index === activeNightIndex) {
                tab.classList.add('active');
            }
            tab.addEventListener('click', () => renderNight(index));
            nightTabsContainer.appendChild(tab);
        });
    };

    // --- Event Handlers ---

    const handleInteractionChange = (e) => {
        const target = e.target;
        const row = target.closest('.player-row');
        if (!row) return;

        const playerId = row.dataset.playerId;
        const activeNight = nightStates[activeNightIndex];
        const playerState = activeNight.players[playerId];

        if (target.matches('input[type="checkbox"]')) {
            const action = target.dataset.action;
            playerState.interactions[action] = target.checked;
        } else if (target.matches('input[type="number"]')) {
            playerState.group = target.value ? parseInt(target.value, 10) : null;
        } else if (target.matches('.status-btn.life')) {
            playerState.isAlive = !playerState.isAlive;
            row.classList.toggle('status-dead', !playerState.isAlive);
            target.classList.toggle('alive', playerState.isAlive);
            target.classList.toggle('dead', !playerState.isAlive);
        } else if (target.matches('.status-btn.ability')) {
            playerState.abilityOn = !playerState.abilityOn;
            target.classList.toggle('ability-on', playerState.abilityOn);
            target.classList.toggle('ability-off', !playerState.abilityOn);
        }

        processInteractions();
    };
    
    addNightBtn.addEventListener('click', () => {
        const newNight = createNewNightState();
        nightStates.push(newNight);
        renderNightTabs();
        renderNight(nightStates.length - 1);
    });

    // --- Initial Load ---
    
    const initialize = (roomId) => {
        roomIdDisplay.textContent = roomId;
        const roomRef = database.ref(`rooms/${roomId}/players`);
        
        roomRef.once('value', (snapshot) => {
            const playersData = snapshot.val();
            if (playersData) {
                roomPlayers = Object.keys(playersData).map(key => ({
                    id: key,
                    ...playersData[key]
                }));
                // Bắt đầu với đêm đầu tiên
                addNightBtn.click();
                interactionTable.addEventListener('change', handleInteractionChange);
                interactionTable.addEventListener('click', handleInteractionChange);
            } else {
                interactionTable.innerHTML = '<p>Không tìm thấy dữ liệu người chơi trong phòng này.</p>';
            }
        }, (error) => {
            console.error(error);
            interactionTable.innerHTML = '<p>Lỗi khi tải dữ liệu phòng.</p>';
        });
    };

    currentRoomId = getRoomIdFromURL();
    if (currentRoomId) {
        // Thêm các element mới vào HTML một cách tự động
        const resultsCard = document.querySelector('.results-card');
        const tabsDiv = document.createElement('div');
        tabsDiv.className = 'night-tabs-container';
        tabsDiv.innerHTML = `
            <h3>Các Đêm:</h3>
            <div id="night-tabs"></div>
            <button id="add-night-btn" class="btn-add-night"><i class="fas fa-plus"></i> Thêm Đêm</button>
        `;
        resultsCard.parentNode.insertBefore(tabsDiv, resultsCard);

        // Gán lại các biến DOM sau khi đã thêm element
        const newAddNightBtn = document.getElementById('add-night-btn');
        const newNightTabsContainer = document.getElementById('night-tabs');
        
        newAddNightBtn.addEventListener('click', () => {
            const newNight = createNewNightState();
            nightStates.push(newNight);
            renderNightTabs();
            renderNight(nightStates.length - 1);
        });

        // Gán lại biến global để các hàm khác có thể sử dụng
        window.nightTabsContainer = newNightTabsContainer;
        
        initialize(currentRoomId);
    } else {
        document.body.innerHTML = '<h1>Lỗi: Không tìm thấy ID phòng. Vui lòng quay lại trang quản trị.</h1>';
    }
});