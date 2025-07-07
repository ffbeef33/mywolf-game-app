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
    const loginSection = document.getElementById('login-section');
    const gameSection = document.getElementById('game-section');
    const passwordInput = document.getElementById('password-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');
    const playerNameDisplay = document.getElementById('player-name-display');
    const roomIdDisplay = document.getElementById('room-id-display');
    const waitingSection = document.getElementById('waiting-section');
    const playerPickSection = document.getElementById('player-pick-section');
    const roleRevealSection = document.getElementById('role-reveal-section');
    const pickTimerDisplay = document.getElementById('pick-timer-display');
    const roleChoicesContainer = document.getElementById('role-choices-container');
    const randomChoiceBtn = document.getElementById('random-choice-btn');
    const choiceStatus = document.getElementById('choice-status');
    const rolesInGameDisplay = document.getElementById('roles-in-game-display');

    let roomListener = null;
    let pickTimerInterval = null;
    let searchInterval = null;
    let currentRoomId = null;
    let allRolesData = [];

    // --- DATA FETCHING ---
    const fetchAllRolesData = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải dữ liệu vai trò.');
            const rawData = await response.json();
            allRolesData = rawData.map(role => ({
                name: role.RoleName || 'Lỗi',
                faction: role.Faction || 'Chưa phân loại'
            }));
        } catch (error) {
            console.error("Lỗi nghiêm trọng khi tải dữ liệu vai trò:", error);
        }
    };

    // --- LOGIN & SESSION ---
    const handleLogin = async () => {
        const password = passwordInput.value.trim();
        if (!password) {
            loginError.textContent = 'Vui lòng nhập mật khẩu của bạn.';
            return;
        }
        loginError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang xác thực...';
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const userData = await response.json();
            if (!userData.success) throw new Error(userData.message || 'Mật khẩu không hợp lệ.');
            
            sessionStorage.setItem('mywolf_username', userData.username);
            startPeriodicRoomSearch(userData.username);

        } catch (error) {
            goBackToLogin(error.message);
        }
    };

    const checkSessionAndAutoLogin = () => {
        const username = sessionStorage.getItem('mywolf_username');
        if (username) {
            startPeriodicRoomSearch(username);
        } else {
            loginSection.classList.remove('hidden');
            gameSection.classList.add('hidden');
        }
    };

    // --- CORE GAME LOGIC & UI ---
    const cleanup = () => {
        if (roomListener && currentRoomId) database.ref(`rooms/${currentRoomId}`).off('value', roomListener);
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        if (searchInterval) clearInterval(searchInterval);
        roomListener = pickTimerInterval = searchInterval = currentRoomId = null;
    };

    const goBackToLogin = (message) => {
        cleanup();
        gameSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        loginError.textContent = message;
        passwordInput.value = '';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Tìm và Vào Game';
    };

    const startPeriodicRoomSearch = (username) => {
        cleanup();
        loginSection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        playerNameDisplay.textContent = username;
        showSection(waitingSection);
        rolesInGameDisplay.classList.add('hidden');

        const scanForRoom = async () => {
            try {
                const roomsRef = database.ref('rooms');
                const snapshot = await roomsRef.get();
                const allRooms = snapshot.val();
                let foundRoomId = null;
                if (allRooms) {
                    for (const roomId in allRooms) {
                        if (allRooms[roomId].players && Object.values(allRooms[roomId].players).some(p => p.name === username)) {
                            foundRoomId = roomId;
                            break;
                        }
                    }
                }
                if (foundRoomId) {
                    clearInterval(searchInterval);
                    searchInterval = null;
                    attachListenerToSpecificRoom(username, foundRoomId);
                }
            } catch (error) {
                console.error("Lỗi khi quét phòng:", error);
            }
        };
        scanForRoom();
        searchInterval = setInterval(scanForRoom, 5000);
    };

    function attachListenerToSpecificRoom(username, roomId) {
        currentRoomId = roomId;
        const roomRef = database.ref(`rooms/${roomId}`);
        roomListener = roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            if (roomData) {
                updateGameState(username, roomId, roomData);
            } else {
                startPeriodicRoomSearch(username);
            }
        }, (error) => {
            console.error("Firebase listener error:", error);
            goBackToLogin('Mất kết nối với phòng chơi.');
        });
    }

    function updateGameState(username, roomId, roomData) {
        roomIdDisplay.textContent = roomId;
        displayRolesInGame(roomData.rolesToAssign || []);
        
        const myPlayer = Object.values(roomData.players).find(p => p.name === username);
        if (!myPlayer) {
            startPeriodicRoomSearch(username);
            return;
        }

        if (myPlayer.role) {
            showSection(roleRevealSection);
            updateRoleCard(myPlayer.role);
        } else if (roomData.playerPickState && roomData.playerPickState.status === 'picking') {
            showSection(playerPickSection);
            handlePlayerPickState(username, roomId, roomData.playerPickState);
        } else {
            showSection(waitingSection);
        }
    }
    
    function showSection(sectionToShow) {
        [waitingSection, playerPickSection, roleRevealSection].forEach(section => {
            section.classList.toggle('hidden', section !== sectionToShow);
        });
    }
    
    // *** HÀM ĐÃ ĐƯỢC CẬP NHẬT ĐỂ HIỂN THỊ ĐẸP HƠN ***
    function displayRolesInGame(roleNames) {
        rolesInGameDisplay.innerHTML = '';
        if (roleNames.length === 0 || allRolesData.length === 0) {
            rolesInGameDisplay.classList.add('hidden');
            return;
        }

        const rolesByFaction = roleNames.reduce((acc, name) => {
            const roleData = allRolesData.find(r => r.name === name);
            const faction = roleData ? roleData.faction : 'Chưa phân loại';
            if (!acc[faction]) {
                acc[faction] = [];
            }
            acc[faction].push(name);
            return acc;
        }, {});

        const factionOrder = ['Phe Sói', 'Phe Dân', 'Phe Trung Lập', 'Chưa phân loại'];

        factionOrder.forEach(faction => {
            if (rolesByFaction[faction]) {
                const factionBox = document.createElement('div');
                factionBox.className = 'faction-box';

                const factionTitle = document.createElement('h4');
                factionTitle.className = 'faction-title';
                factionTitle.textContent = faction;
                factionBox.appendChild(factionTitle);

                const rolesList = document.createElement('div');
                rolesList.className = 'roles-grid';
                
                rolesByFaction[faction].sort().forEach(roleName => {
                    const roleCard = document.createElement('div');
                    roleCard.className = 'in-game-role-card';
                    roleCard.textContent = roleName;
                    rolesList.appendChild(roleCard);
                });
                
                factionBox.appendChild(rolesList);
                rolesInGameDisplay.appendChild(factionBox);
            }
        });

        rolesInGameDisplay.classList.remove('hidden');
    }

    function handlePlayerPickState(username, roomId, state) {
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        
        const updateTimer = () => {
            const remaining = Math.round((state.endTime - Date.now()) / 1000);
            pickTimerDisplay.textContent = remaining > 0 ? `${remaining}s` : "Hết giờ!";
            if (remaining <= 0) clearInterval(pickTimerInterval);
        };
        updateTimer();
        pickTimerInterval = setInterval(updateTimer, 1000);

        const myChoice = state.playerChoices[username];
        const hasChosen = myChoice && myChoice !== 'waiting';

        roleChoicesContainer.innerHTML = '';
        if (!hasChosen) {
            state.availableRoles.forEach(roleName => {
                const btn = document.createElement('button');
                btn.className = 'choice-btn';
                btn.textContent = roleName;
                btn.addEventListener('click', () => selectRole(username, roomId, roleName));
                roleChoicesContainer.appendChild(btn);
            });
            randomChoiceBtn.disabled = false;
            choiceStatus.textContent = 'Hãy đưa ra lựa chọn của bạn...';
        } else {
            roleChoicesContainer.innerHTML = `<p>Lựa chọn của bạn:</p><h3>${myChoice === 'random' ? 'Nhận Ngẫu Nhiên' : myChoice}</h3>`;
            randomChoiceBtn.disabled = true;
            choiceStatus.textContent = 'Đang chờ những người chơi khác...';
        }
    }

    function selectRole(username, roomId, choice) {
        database.ref(`rooms/${roomId}/playerPickState/playerChoices/${username}`).set(choice)
            .catch(err => console.error("Lỗi khi gửi lựa chọn:", err));
    }
    
    function updateRoleCard(role) {
        document.getElementById('role-name').textContent = role.name || 'Chưa có tên';
        document.getElementById('role-faction').textContent = `Phe ${role.faction || 'Chưa rõ'}`;
        document.getElementById('role-description').textContent = role.description || 'Chưa có mô tả.';
        const roleImage = document.getElementById('role-image');
        const roleFactionEl = document.getElementById('role-faction');
        roleImage.src = role.image || 'assets/images/default-role.png';
        roleImage.alt = `Hình ảnh cho ${role.name}`;
        roleFactionEl.className = 'role-faction';
        if (role.faction === 'Phe Sói') roleFactionEl.classList.add('wolf');
        else if (role.faction === 'Phe Dân') roleFactionEl.classList.add('villager');
        else roleFactionEl.classList.add('neutral');
    }

    // --- EVENT LISTENERS ---
    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') loginBtn.click();
    });
    roleRevealSection.addEventListener('click', () => {
        roleRevealSection.classList.toggle('is-flipped');
    });
    randomChoiceBtn.addEventListener('click', () => {
        if (currentRoomId) {
            const username = sessionStorage.getItem('mywolf_username');
            if (username) selectRole(username, currentRoomId, 'random');
        }
    });

    // --- INITIAL LOAD ---
    const initialize = async () => {
        await fetchAllRolesData();
        checkSessionAndAutoLogin();
    };

    initialize();
});