// =================================================================
// === player.js - CẬP NHẬT LOGIC 2 HÀNH ĐỘNG CHO SÓI (Bản đầy đủ) ===
// =================================================================

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
    const playerActionsContainer = document.getElementById('player-actions-container');
    const roleDescriptionModal = document.getElementById('role-description-modal');
    const modalRoleName = document.getElementById('modal-role-name');
    const modalRoleFaction = document.getElementById('modal-role-faction');
    const modalRoleDescription = document.getElementById('modal-role-description');
    const votingUiSection = document.getElementById('voting-ui-section');
    const voteTitleDisplay = document.getElementById('vote-title-display');
    const voteTimerDisplay = document.getElementById('vote-timer-display');
    const voteOptionsContainer = document.getElementById('vote-options-container');
    const voteStatusMessage = document.getElementById('vote-status-message');
    const openWillModalBtn = document.getElementById('open-will-modal-btn');
    const willWritingModal = document.getElementById('will-writing-modal');
    const willTextarea = document.getElementById('will-textarea');
    const willWordCount = document.getElementById('will-word-count');
    const saveWillBtn = document.getElementById('save-will-btn');
    const saveWillStatus = document.getElementById('save-will-status');
    const publishedWillModal = document.getElementById('published-will-modal');
    const publishedWillPlayerName = document.getElementById('published-will-player-name');
    const publishedWillContent = document.getElementById('published-will-content');
    const interactiveActionSection = document.getElementById('interactive-action-section');

    // --- State ---
    let roomListener = null;
    let publicWillListener = null;
    let nightResultListener = null;
    let pickTimerInterval = null;
    let voteTimerInterval = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let allRolesData = [];
    let myPlayerData = {};

    // --- DATA FETCHING ---
    const fetchAllRolesData = async () => {
        try {
            const response = await fetch(`/api/sheets?sheetName=Roles`);
            if (!response.ok) throw new Error('Không thể tải dữ liệu vai trò.');
            const rawData = await response.json();
            allRolesData = rawData.map(role => ({
                name: (role.RoleName || 'Lỗi').trim(),
                faction: (role.Faction || 'Chưa phân loại').trim(),
                description: (role.Describe || 'Không có mô tả.').trim(),
                kind: (role.Kind || 'empty').trim()
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
                body: JSON.stringify({ password, action: 'login' })
            });
            const userData = await response.json();
            if (!userData.success) throw new Error(userData.message || 'Mật khẩu không hợp lệ.');
            
            sessionStorage.setItem('mywolf_username', userData.username);
            loginSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playerNameDisplay.textContent = userData.username;
            showSection(waitingSection);
            listenForRoomCreated(userData.username);

        } catch (error) {
            loginError.textContent = error.message || 'Đăng nhập thất bại.';
            loginBtn.disabled = false;
            loginBtn.textContent = 'Vào Game';
        }
    };

    const checkSessionAndAutoLogin = () => {
        const username = sessionStorage.getItem('mywolf_username');
        if (username) {
            loginSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playerNameDisplay.textContent = username;
            showSection(waitingSection);
            listenForRoomCreated(username);
        } else {
            loginSection.classList.remove('hidden');
            gameSection.classList.add('hidden');
        }
    };

    // --- CORE GAME LOGIC & UI ---
    const cleanup = () => {
        if (roomListener && currentRoomId) database.ref(`rooms/${currentRoomId}`).off('value', roomListener);
        if (publicWillListener && currentRoomId) database.ref(`rooms/${currentRoomId}/publicData/publishedWill`).off('value', publicWillListener);
        if (nightResultListener && currentRoomId) database.ref(`rooms/${currentRoomId}/nightResults`).off('value', nightResultListener);
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        if (voteTimerInterval) clearInterval(voteTimerInterval);
        roomListener = publicWillListener = nightResultListener = pickTimerInterval = voteTimerInterval = currentRoomId = myPlayerId = null;
    };

    function listenForRoomCreated(username) {
        cleanup();
        const roomsRef = database.ref('rooms');
        roomsRef.on('value', function(snapshot) {
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
                roomsRef.off(); 
                attachListenersToRoom(username, foundRoomId);
            }
        });
    }

    function attachListenersToRoom(username, roomId) {
        currentRoomId = roomId;
        
        const roomRef = database.ref(`rooms/${roomId}`);
        roomListener = roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            if (roomData) {
                updateGameState(username, roomId, roomData);
            } else {
                showSection(waitingSection);
                waitingSection.querySelector('.waiting-message').textContent = "Phòng đã bị xóa, vui lòng liên hệ quản trò!";
            }
        });
        
        const publicWillRef = database.ref(`rooms/${roomId}/publicData/publishedWill`);
        if(publicWillListener) publicWillRef.off('value', publicWillListener);
        publicWillListener = publicWillRef.on('value', (snapshot) => {
            const publishedWill = snapshot.val();
            if (publishedWill && publishedWill.content) {
                showPublishedWill(publishedWill);
            }
        });

        const nightResultRef = database.ref(`rooms/${roomId}/nightResults`);
        if (nightResultListener) nightResultRef.off('value', nightResultListener);
        nightResultListener = nightResultRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                const allNightResults = snapshot.val();
                const latestNight = Object.keys(allNightResults).pop();
                const results = allNightResults[latestNight];
                if (results && !document.querySelector('.night-result-popup')) {
                     displayNightResult(results, latestNight);
                }
            }
        });
    }

    function updateGameState(username, roomId, roomData) {
        roomIdDisplay.textContent = roomId;
        displayRolesInGame(roomData.rolesToAssign || []);
        
        const myPlayerEntry = Object.entries(roomData.players).find(([id, p]) => p.name === username);
        if (!myPlayerEntry) {
            showSection(waitingSection);
            playerActionsContainer.classList.add('hidden');
            waitingSection.querySelector('.waiting-message').textContent = "Bạn không có trong phòng này!";
            return;
        }

        myPlayerId = myPlayerEntry[0]; 
        myPlayerData = myPlayerEntry[1]; 
        
        if (myPlayerData.roleName) {
            playerActionsContainer.classList.remove('hidden');
            openWillModalBtn.disabled = !myPlayerData.isAlive;
            openWillModalBtn.textContent = myPlayerData.isAlive ? 'Viết Di Chúc' : 'Đã Chết';
        } else {
            playerActionsContainer.classList.add('hidden');
        }

        const interactiveState = roomData.interactiveState;
        if (interactiveState && interactiveState.phase === 'night' && myPlayerData.isAlive) {
            hideAllGameCards();
            displayNightActions(roomData, interactiveState.currentNight);
            return; 
        }
        
        interactiveActionSection.classList.add('hidden');

        const votingState = roomData.votingState;
        if (votingState && votingState.status === 'active') {
            if (myPlayerData.isAlive) {
                showSection(votingUiSection);
                handleVotingState(username, roomId, votingState);
            } else {
                showSection(waitingSection);
                waitingSection.querySelector('h2').textContent = "Đang diễn ra vote...";
                waitingSection.querySelector('.waiting-message').textContent = "Bạn đã chết và không thể tham gia bỏ phiếu.";
            }
            return;
        }

        if (myPlayerData.roleName) {
            showSection(roleRevealSection);
            const fullRoleData = allRolesData.find(role => role.name === myPlayerData.roleName);
            updateRoleCard(fullRoleData);
        } else if (roomData.playerPickState && roomData.playerPickState.status === 'picking') {
            showSection(playerPickSection);
            handlePlayerPickState(username, roomId, roomData.playerPickState);
        } else {
            showSection(waitingSection);
            waitingSection.querySelector('h2').textContent = "Đang chờ Quản Trò...";
            waitingSection.querySelector('.waiting-message').textContent = "Chờ quản trò bắt đầu...";
        }
    }
    
    function showSection(sectionToShow) {
        [waitingSection, playerPickSection, roleRevealSection, votingUiSection, interactiveActionSection].forEach(section => {
            section.classList.toggle('hidden', section !== sectionToShow);
        });
    }

    function hideAllGameCards() {
         [waitingSection, playerPickSection, roleRevealSection, votingUiSection].forEach(section => {
            section.classList.add('hidden');
        });
    }

    function showRoleDescriptionModal(roleName) {
        const roleData = allRolesData.find(r => r.name === roleName);
        if (roleData) {
            modalRoleName.textContent = roleData.name;
            modalRoleFaction.textContent = `Phe: ${roleData.faction}`;
            modalRoleDescription.textContent = roleData.description;
            roleDescriptionModal.classList.remove('hidden');
        }
    };
    
    function displayRolesInGame(roleNames) {
        rolesInGameDisplay.innerHTML = '';
        if (roleNames.length === 0 || allRolesData.length === 0) {
            rolesInGameDisplay.classList.add('hidden');
            return;
        }
        const instruction = document.createElement('p');
        instruction.className = 'role-list-instruction';
        instruction.innerHTML = '💡 Chạm vào một vai trò để xem mô tả';
        rolesInGameDisplay.appendChild(instruction);
        const rolesByFaction = roleNames.reduce((acc, name) => {
            const roleData = allRolesData.find(r => r.name.trim() === name.trim());
            const faction = roleData ? roleData.faction : 'Chưa phân loại';
            if (!acc[faction]) acc[faction] = [];
            acc[faction].push(name);
            return acc;
        }, {});
        const factionOrder = ['Phe Sói', 'Bầy Sói', 'Phe Dân', 'Phe trung lập', 'Chưa phân loại'];
        const getFactionClassAndIcon = (faction) => {
            if (faction === 'Phe Sói' || faction === 'Bầy Sói') return { class: 'faction-wolf', icon: 'fa-solid fa-paw' };
            if (faction === 'Phe Dân') return { class: 'faction-villager', icon: 'fa-solid fa-shield-halved' };
            if (faction === 'Phe trung lập') return { class: 'faction-neutral', icon: 'fa-solid fa-person-circle-question' };
            return { class: 'faction-unknown', icon: 'fa-solid fa-question' };
        };
        factionOrder.forEach(faction => {
            if (rolesByFaction[faction]) {
                const { class: factionClass, icon: factionIcon } = getFactionClassAndIcon(faction);
                const factionBox = document.createElement('div');
                factionBox.className = `faction-box ${factionClass}`;
                const factionTitle = document.createElement('h4');
                factionTitle.className = 'faction-title';
                factionTitle.innerHTML = `<i class="${factionIcon}"></i> ${faction}`;
                factionBox.appendChild(factionTitle);
                const rolesList = document.createElement('div');
                rolesList.className = 'roles-list';
                rolesByFaction[faction].sort().forEach(roleName => {
                    const roleItem = document.createElement('p');
                    roleItem.className = 'in-game-role-item';
                    roleItem.textContent = roleName;
                    roleItem.onclick = () => showRoleDescriptionModal(roleName);
                    rolesList.appendChild(roleItem);
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

    function handleVotingState(username, roomId, state) {
        if (voteTimerInterval) clearInterval(voteTimerInterval);
        voteTitleDisplay.textContent = state.title;
        database.ref('/.info/serverTimeOffset').once('value', (snap) => {
            const offset = snap.val();
            const updateTimer = () => {
                const remaining = Math.round((state.endTime - (Date.now() + offset)) / 1000);
                voteTimerDisplay.textContent = remaining > 0 ? `${remaining}s` : "Hết giờ!";
                if (remaining <= 0) {
                    clearInterval(voteTimerInterval);
                    voteOptionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);
                    voteStatusMessage.textContent = "Đã hết thời gian vote.";
                }
            };
            updateTimer();
            voteTimerInterval = setInterval(updateTimer, 1000);
        });
        const myChoice = state.choices ? state.choices[username] : null;
        voteOptionsContainer.innerHTML = '';
        for (const playerId in state.candidates) {
            const playerName = state.candidates[playerId];
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = playerName;
            btn.dataset.targetId = playerId;
            if (playerId === myChoice) btn.classList.add('selected');
            btn.addEventListener('click', () => selectVote(username, roomId, playerId));
            voteOptionsContainer.appendChild(btn);
        }
        const skipBtn = document.createElement('button');
        skipBtn.className = 'choice-btn btn-secondary';
        skipBtn.textContent = 'Bỏ qua';
        skipBtn.dataset.targetId = 'skip_vote';
        if (myChoice === 'skip_vote') skipBtn.classList.add('selected');
        skipBtn.addEventListener('click', () => selectVote(username, roomId, 'skip_vote'));
        voteOptionsContainer.appendChild(skipBtn);
        if (myChoice) {
            voteStatusMessage.textContent = 'Bạn có thể thay đổi lựa chọn của mình.';
        } else {
            voteStatusMessage.textContent = 'Hãy bỏ phiếu...';
        }
    }
    
    function selectVote(username, roomId, targetId) {
        const choiceRef = database.ref(`rooms/${roomId}/votingState/choices/${username}`);
        choiceRef.once('value', (snapshot) => {
            const currentChoice = snapshot.val();
            if (currentChoice === targetId) choiceRef.set(null);
            else choiceRef.set(targetId);
        }).catch(err => console.error("Lỗi khi đọc phiếu vote:", err));
    }

    function selectRole(username, roomId, choice) {
        database.ref(`rooms/${roomId}/playerPickState/playerChoices/${username}`).set(choice)
            .catch(err => console.error("Lỗi khi gửi lựa chọn:", err));
    }
    
    function updateRoleCard(roleData) {
        if (!roleData) {
            document.getElementById('role-name').textContent = 'Lỗi';
            document.getElementById('role-faction').textContent = 'Không tìm thấy vai trò';
            document.getElementById('role-description').textContent = 'Không thể tải dữ liệu cho vai trò này.';
            return;
        }
        document.getElementById('role-name').textContent = roleData.name || 'Chưa có tên';
        document.getElementById('role-faction').textContent = `Phe ${roleData.faction || 'Chưa rõ'}`;
        document.getElementById('role-description').textContent = roleData.description || 'Chưa có mô tả.';
        const roleFactionEl = document.getElementById('role-faction');
        const roleIconEl = document.getElementById('role-icon');
        roleFactionEl.className = 'role-faction'; 
        roleIconEl.className = 'role-icon';
        const faction = roleData.faction.trim();
        let iconClass = 'fa-solid fa-question';
        if (faction === 'Phe Sói' || faction === 'Bầy Sói') {
            roleFactionEl.classList.add('wolf');
            iconClass = 'fa-solid fa-paw';
        } else if (faction === 'Phe Dân') {
            roleFactionEl.classList.add('villager');
            iconClass = 'fa-solid fa-shield-halved';
        } else if (faction === 'Phe trung lập') {
            roleFactionEl.classList.add('neutral');
            iconClass = 'fa-solid fa-person-circle-question';
        }
        roleIconEl.className = `role-icon ${iconClass}`;
        const factionColorVar = `--${roleFactionEl.classList[1]}-color`;
        roleIconEl.style.color = getComputedStyle(document.documentElement).getPropertyValue(factionColorVar);
    }
    
    // --- DI CHÚC ---
    const countWords = (text) => {
        if (!text) return 0;
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    };
    const updateWordCount = () => {
        const text = willTextarea.value;
        const words = countWords(text);
        willWordCount.textContent = `${words}/100 từ`;
        if (words > 100) {
            willWordCount.style.color = 'var(--wolf-color)';
            saveWillBtn.disabled = true;
        } else {
            willWordCount.style.color = 'var(--light-text)';
            saveWillBtn.disabled = false;
        }
    };
    const openWillModal = () => {
        if (!currentRoomId || !myPlayerId) return;
        const willRef = database.ref(`rooms/${currentRoomId}/players/${myPlayerId}/will/content`);
        willRef.once('value').then(snapshot => {
            willTextarea.value = snapshot.val() || '';
            updateWordCount();
            saveWillStatus.textContent = '';
            willWritingModal.classList.remove('hidden');
        });
    };
    const saveWill = () => {
        if (!currentRoomId || !myPlayerId) return;
        const words = countWords(willTextarea.value);
        if (words > 100) {
            saveWillStatus.textContent = 'Di chúc quá dài, vui lòng rút gọn!';
            return;
        }
        saveWillBtn.disabled = true;
        saveWillStatus.textContent = 'Đang lưu...';
        const willData = {
            content: willTextarea.value,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
        };
        database.ref(`rooms/${currentRoomId}/players/${myPlayerId}/will`).set(willData)
            .then(() => {
                saveWillStatus.textContent = 'Đã lưu thành công!';
                setTimeout(() => {
                    willWritingModal.classList.add('hidden');
                    saveWillBtn.disabled = false;
                }, 1500);
            })
            .catch(err => {
                saveWillStatus.textContent = 'Lỗi: ' + err.message;
                saveWillBtn.disabled = false;
            });
    };
    const showPublishedWill = (willData) => {
        publishedWillPlayerName.textContent = `Di Chúc của ${willData.playerName}`;
        publishedWillContent.textContent = willData.content || "Người này không để lại di chúc.";
        publishedWillModal.classList.remove('hidden');
    };

    // --- MODULE TƯƠNG TÁC ---
    function displayNightActions(roomData, currentNight) {
        interactiveActionSection.classList.remove('hidden');
        interactiveActionSection.innerHTML = ''; // Xóa sạch nội dung cũ để tạo lại

        const myRole = allRolesData.find(r => r.name === myPlayerData.roleName) || {};
        const isWolfFaction = myRole.faction === 'Bầy Sói' || myRole.faction === 'Phe Sói';
        const livingPlayers = Object.entries(roomData.players).filter(([id, player]) => player.isAlive);

        // Luôn hiển thị hành động "Bầy cắn" nếu là Sói
        if (isWolfFaction) {
            const wolfBiteAction = {
                title: "Hành động Bầy Sói: Cắn",
                description: "Thống nhất chọn một mục tiêu để loại bỏ khỏi làng.",
                actionKind: 'kill',
                path: `rooms/${currentRoomId}/nightActions/${currentNight}/wolf_group`,
                confirmText: "Xác nhận Cắn"
            };
            interactiveActionSection.appendChild(createActionPanel(wolfBiteAction, livingPlayers));
        }

        // Kiểm tra các chức năng riêng
        const kinds = myRole.kind ? myRole.kind.split('_') : [];
        kinds.forEach(kind => {
            if ((isWolfFaction && kind === 'kill') || kind === 'empty' || !kind) {
                return;
            }
            
            const actionInfo = KIND_TO_ACTION_MAP[kind] || { label: kind };

            const individualAction = {
                title: `Chức năng riêng: ${actionInfo.label}`,
                description: `Chọn mục tiêu để thực hiện chức năng ${actionInfo.label}.`,
                actionKind: kind,
                path: `rooms/${currentRoomId}/nightActions/${currentNight}/${myPlayerId}`,
                confirmText: `Xác nhận ${actionInfo.label}`
            };
            interactiveActionSection.appendChild(createActionPanel(individualAction, livingPlayers));
        });

        if (!isWolfFaction && kinds.every(k => k === 'empty' || !k)) {
             interactiveActionSection.innerHTML = `
                <div class="game-card">
                    <h2>Thư giãn</h2>
                    <p>Đêm nay bạn không có chức năng đặc biệt. Hãy chờ trời sáng.</p>
                </div>`;
        }
    }
    
    function createActionPanel(actionDetails, livingPlayers) {
        const panel = document.createElement('div');
        panel.className = 'game-card';
        panel.style.marginBottom = '20px';

        let targetsHTML = '';
        livingPlayers.forEach(([id, player]) => {
            let playerName = player.name;
            if (myPlayerId === id) playerName += " (Bản thân)";
            targetsHTML += `<button class="choice-btn" data-target-id="${id}">${playerName}</button>`;
        });

        panel.innerHTML = `
            <h2 class="action-title">${actionDetails.title}</h2>
            <p class="action-description">${actionDetails.description}</p>
            <div class="choices-grid action-targets-container">${targetsHTML}</div>
            <button class="confirm-action-btn hidden">${actionDetails.confirmText}</button>
            <p class="choice-status-message"></p>
        `;

        const targetsContainer = panel.querySelector('.action-targets-container');
        const confirmBtn = panel.querySelector('.confirm-action-btn');
        const statusMsg = panel.querySelector('.choice-status-message');
        let selectedTargetId = null;

        targetsContainer.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                targetsContainer.querySelector('.selected')?.classList.remove('selected');
                e.target.classList.add('selected');
                selectedTargetId = e.target.dataset.targetId;
                confirmBtn.classList.remove('hidden');
            }
        });

        confirmBtn.addEventListener('click', () => {
            if (selectedTargetId) {
                const actionData = {
                    action: actionDetails.actionKind,
                    target: selectedTargetId
                };
                submitNightAction(actionDetails.path, actionData, { targetsContainer, confirmBtn, statusMsg });
            }
        });

        return panel;
    }

    function submitNightAction(path, data, uiElements) {
        database.ref(path).set(data)
            .then(() => {
                uiElements.statusMsg.textContent = "Đã gửi hành động thành công!";
                uiElements.targetsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);
                uiElements.confirmBtn.disabled = true;
            })
            .catch(error => {
                uiElements.statusMsg.textContent = "Lỗi! Không thể gửi hành động: " + error.message;
            });
    }

    function displayNightResult(results, nightNumber) {
        if (document.querySelector('.night-result-popup')) return;

        const publicResult = results.public || {};
        const privateResult = results.private?.[myPlayerId] || null;

        let message = `<h2>Kết quả đêm ${nightNumber}</h2>`;
        
        if (publicResult.deadPlayerNames && publicResult.deadPlayerNames.length > 0) {
            message += `<p><strong>Nạn nhân:</strong> ${publicResult.deadPlayerNames.join(', ')}</p>`;
        } else {
            message += `<p>Đêm nay không có ai chết.</p>`;
        }

        if (privateResult) {
            message += `<hr><p><strong>Thông tin riêng của bạn:</strong><br>${privateResult}</p>`;
        }

        const popup = document.createElement('div');
        popup.className = 'modal night-result-popup';
        popup.innerHTML = `
            <div class="modal-content">
                ${message}
                <button id="close-result-popup" class="login-button">Đã hiểu</button>
            </div>
        `;
        document.body.appendChild(popup);
        popup.querySelector('#close-result-popup').addEventListener('click', () => {
            popup.remove();
        });
    }

    // --- EVENT LISTENERS ---
    const eventListeners = [
        { el: loginBtn, event: 'click', handler: handleLogin },
        { el: passwordInput, event: 'keyup', handler: (e) => { if (e.key === 'Enter') loginBtn.click(); } },
        { el: roleRevealSection, event: 'click', handler: () => roleRevealSection.classList.toggle('is-flipped') },
        { el: randomChoiceBtn, event: 'click', handler: () => {
            if (currentRoomId) {
                const username = sessionStorage.getItem('mywolf_username');
                if (username) selectRole(username, currentRoomId, 'random');
            }
        }},
        { el: roleDescriptionModal, event: 'click', handler: (e) => {
            if (e.target === roleDescriptionModal || e.target.classList.contains('close-modal-btn')) {
                roleDescriptionModal.classList.add('hidden');
            }
        }},
        { el: openWillModalBtn, event: 'click', handler: openWillModal },
        { el: willTextarea, event: 'input', handler: updateWordCount },
        { el: saveWillBtn, event: 'click', handler: saveWill }
    ];

    eventListeners.forEach(({ el, event, handler }) => {
        if (el) el.addEventListener(event, handler);
    });

    [willWritingModal, publishedWillModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('close-modal-btn')) {
                    modal.classList.add('hidden');
                }
            });
        }
    });

    // --- INITIAL LOAD ---
    const initialize = async () => {
        // Cần file game-logic.js để lấy biến KIND_TO_ACTION_MAP
        const script = document.createElement('script');
        script.src = 'game-logic.js';
        script.onload = async () => {
            await fetchAllRolesData();
            checkSessionAndAutoLogin();
        };
        document.head.appendChild(script);
    };
    initialize();
});