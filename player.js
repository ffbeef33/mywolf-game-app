// =================================================================
// === player.js - PHIÊN BẢN CẬP NHẬT HIỂN THỊ KẾT QUẢ ĐÊM & WIZARD ===
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
    const privateLogSection = document.getElementById('private-log-section');
    const privateLogContent = document.getElementById('private-log-content');

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
    let roomData = {};

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
                kind: (role.Kind || 'empty').trim(),
                active: (role.Active || 'n').trim().toLowerCase(),
                quantity: parseInt(role.Quantity, 10) || 1,
                duration: (role.Duration || '1').toString().trim().toLowerCase()
            }));
        } catch (error) {
            console.error("Lỗi nghiêm trọng khi tải dữ liệu vai trò:", error);
        }
    };

    // --- Các hàm logic chính ---
    const handleLogin = async () => {
        const password = passwordInput.value.trim();
        if (!password) {
            loginError.textContent = 'Vui lòng nhập mật khẩu của bạn.'; return;
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
            const newRoomData = snapshot.val();
            if (newRoomData) {
                roomData = newRoomData;
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
                updatePrivateLog(snapshot.val());
            } else {
                privateLogSection.classList.add('hidden');
                privateLogContent.innerHTML = '';
            }
        });
    }
    function updateGameState(username, roomId, currentRoomData) {
        roomIdDisplay.textContent = roomId;
        displayRolesInGame(currentRoomData.rolesToAssign || []);
        const myPlayerEntry = Object.entries(currentRoomData.players).find(([id, p]) => p.name === username);
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
        const interactiveState = currentRoomData.interactiveState;
        if (interactiveState && interactiveState.phase === 'night' && myPlayerData.isAlive) {
            hideAllGameCards();
            displayNightActions(currentRoomData, interactiveState.currentNight);
            return; 
        }
        interactiveActionSection.classList.add('hidden');
        const votingState = currentRoomData.votingState;
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
        } else if (currentRoomData.playerPickState && currentRoomData.playerPickState.status === 'picking') {
            showSection(playerPickSection);
            handlePlayerPickState(username, roomId, currentRoomData.playerPickState);
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
    
    function updatePrivateLog(allNightResults) {
        if (!myPlayerId) return;

        const messages = [];
        const sortedNights = Object.keys(allNightResults).sort((a, b) => parseInt(a) - parseInt(b));

        for (const nightNumber of sortedNights) {
            const nightData = allNightResults[nightNumber];
            if (!nightData) continue;

            const publicResult = nightData.public;
            const privateResult = nightData.private?.[myPlayerId];
            const nightMessages = [];

            // 1. Thêm thông tin công khai về người chết
            if (publicResult) {
                if (publicResult.deadPlayerNames && publicResult.deadPlayerNames.length > 0) {
                    nightMessages.push(`<strong>Nạn nhân:</strong> ${publicResult.deadPlayerNames.join(', ')}.`);
                } else {
                    nightMessages.push('Không có ai chết trong đêm nay.');
                }
            }

            // 2. Thêm thông tin riêng tư (soi, nguyền, v.v.)
            if (privateResult) {
                nightMessages.push(`<em>Thông tin riêng:</em> ${privateResult}`);
            }

            // 3. Kết hợp thành một mục cho đêm đó
            if (nightMessages.length > 0) {
                messages.push(`<p class="log-entry"><strong>[Đêm ${nightNumber}]</strong><br>${nightMessages.join('<br>')}</p>`);
            }
        }

        if (messages.length > 0) {
            privateLogContent.innerHTML = messages.join('');
            privateLogSection.classList.remove('hidden');
        } else {
            privateLogContent.innerHTML = '';
            privateLogSection.classList.add('hidden');
        }
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

    function createWizardSavePanel(actionDetails) {
        const panel = document.createElement('div');
        panel.className = 'game-card';
        panel.style.marginBottom = '20px';

        const currentNight = roomData.interactiveState?.currentNight;
        const actionPath = `rooms/${currentRoomId}/nightActions/${currentNight}/${myPlayerId}`;
        
        let existingAction = null;
        if (currentNight && roomData.nightActions?.[currentNight]?.[myPlayerId]) {
            existingAction = roomData.nightActions[currentNight][myPlayerId];
        }

        if (existingAction) {
             panel.innerHTML = `
                <h2 class="action-title">${actionDetails.title}</h2>
                <p class="action-description">${actionDetails.description}</p>
                <p class="choice-status-message"><strong>Bạn đã quyết định sử dụng khả năng Cứu Thế đêm nay.</strong></p>
            `;
        } else {
            panel.innerHTML = `
                <h2 class="action-title">${actionDetails.title}</h2>
                <p class="action-description">${actionDetails.description}</p>
                <div class="choices-grid" style="grid-template-columns: 1fr 1fr;">
                    <button class="choice-btn" data-action="wizard_save">Sử dụng</button>
                    <button class="choice-btn btn-secondary" data-action="no">Không sử dụng</button>
                </div>
                <p class="choice-status-message">Lựa chọn của bạn là duy nhất trong cả ván chơi.</p>
            `;
            
            panel.querySelector('button[data-action="wizard_save"]').addEventListener('click', () => {
                database.ref(actionPath).set({ action: 'wizard_save', targets: [] });
            });

            panel.querySelector('button[data-action="no"]').addEventListener('click', () => {
                panel.querySelector('.choices-grid').innerHTML = '<p>Bạn đã quyết định không cứu ai đêm nay.</p>';
            });
        }
        return panel;
    }

    function displayNightActions(currentRoomData, currentNight) {
        interactiveActionSection.classList.remove('hidden');
        interactiveActionSection.innerHTML = '';
    
        const myRoleData = allRolesData.find(r => r.name === myPlayerData.roleName) || {};
        const isWolfFaction = myRoleData.faction === 'Bầy Sói' || myRoleData.faction === 'Phe Sói';
        const livingPlayers = Object.entries(currentRoomData.players).filter(([id, player]) => player.isAlive);
        let hasIndividualActions = false;

        // =================================================================
        // === BẮT ĐẦU LOGIC HIỂN THỊ CHO WIZARD (ĐÃ SỬA LỖI) ===
        // =================================================================
        if (myRoleData.kind === 'wizard') {
            const wizardState = myPlayerData.wizardAbilityState || 'save_available';
            
            if (wizardState === 'save_available') {
                hasIndividualActions = true;
                const wizardSaveAction = {
                    title: "Khả năng Cứu Thế (1 lần)",
                    description: "Bạn có muốn cứu tất cả những người bị giết đêm nay không? Nếu không có ai chết, bạn sẽ chết thay.",
                    actionKind: 'wizard_save'
                };
                interactiveActionSection.appendChild(createWizardSavePanel(wizardSaveAction));
            } else if (wizardState === 'kill_available') {
                hasIndividualActions = true;
                const wizardKillAction = {
                    title: `Chức năng riêng: Giết (1 lần)`,
                    description: `Bạn đã cứu người thành công. Giờ bạn có quyền loại bỏ 1 người chơi.`,
                    actionKind: 'wizard_kill', 
                    isWolfGroupAction: false,
                    confirmText: `Xác nhận Giết`,
                    roleInfo: { ...myRoleData, quantity: 1 }
                };
                interactiveActionSection.appendChild(createActionPanel(wizardKillAction, livingPlayers));
            }
        }
        // =================================================================
        // === KẾT THÚC LOGIC HIỂN THỊ CHO WIZARD ===
        // =================================================================
    
        if (isWolfFaction) {
            const curseState = currentRoomData.interactiveState?.curseAbility?.status || 'locked';
            const wolfActionData = currentRoomData.nightActions?.[currentNight]?.wolf_group || {};
            const chosenAction = wolfActionData.action;

            if (!chosenAction || chosenAction === 'kill') {
                const wolfBiteAction = {
                    title: "Hành động Bầy Sói: Cắn",
                    description: "Thống nhất chọn một mục tiêu để loại bỏ khỏi làng.",
                    actionKind: 'kill',
                    isWolfGroupAction: true,
                    confirmText: "Xác nhận Cắn"
                };
                interactiveActionSection.appendChild(createActionPanel(wolfBiteAction, livingPlayers));
            }

            if (curseState === 'available' && (!chosenAction || chosenAction === 'curse')) {
                 const wolfCurseAction = {
                    title: "Hành động Bầy Sói: Nguyền (Dùng 1 lần)",
                    description: "Chọn một người chơi để biến họ thành Sói. Sẽ không có ai bị cắn trong đêm nay.",
                    actionKind: 'curse',
                    isWolfGroupAction: true,
                    confirmText: "Xác nhận Nguyền"
                };
                interactiveActionSection.appendChild(createActionPanel(wolfCurseAction, livingPlayers));
            }
        }
    
        const kinds = myRoleData.kind ? myRoleData.kind.split('_') : [];
        kinds.forEach(kind => {
            const actionInfo = KIND_TO_ACTION_MAP[kind];
    
            if (!actionInfo || (isWolfFaction && kind === 'kill') || kind === 'empty' || kind === 'wizard') {
                return;
            }

            const activeRule = myRoleData.active;
            const nightNumber = currentNight;
            
            const parts = activeRule.split('_');
            const usesRule = parts[0];
            const startNightRule = parts.length > 1 ? parseInt(parts[1], 10) : 1;
            
            if (nightNumber < startNightRule) {
                return;
            }

            const useLimit = (usesRule === 'n') ? Infinity : parseInt(usesRule, 10);
            if (isNaN(useLimit) && usesRule !== 'n') {
                return;
            }

            if (useLimit !== Infinity) {
                let timesUsed = 0;
                const allNightActions = currentRoomData.nightActions || {};
                for (const night in allNightActions) {
                    const nightAction = allNightActions[night][myPlayerId];
                    if (nightAction && nightAction.action === actionInfo.key) {
                        timesUsed++;
                    }
                }
                if (timesUsed >= useLimit) {
                    return;
                }
            }
            
            hasIndividualActions = true;
            const individualAction = {
                title: `Chức năng riêng: ${actionInfo.label}`,
                description: `Chọn mục tiêu để thực hiện chức năng.`,
                actionKind: actionInfo.key, 
                isWolfGroupAction: false,
                confirmText: `Xác nhận ${actionInfo.label}`,
                roleInfo: myRoleData
            };
            interactiveActionSection.appendChild(createActionPanel(individualAction, livingPlayers));
        });
    
        if (!hasIndividualActions && !isWolfFaction) {
             interactiveActionSection.innerHTML += `
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
    
        const currentNight = roomData.interactiveState?.currentNight;
        const actionPath = actionDetails.isWolfGroupAction
            ? `rooms/${currentRoomId}/nightActions/${currentNight}/wolf_group`
            : `rooms/${currentRoomId}/nightActions/${currentNight}/${myPlayerId}`;
        
        const targetLimit = actionDetails.roleInfo ? actionDetails.roleInfo.quantity : 1;
        
        let wolfActionData = {};
        if (currentNight && roomData.nightActions?.[currentNight]) {
             if(actionDetails.isWolfGroupAction) {
                wolfActionData = roomData.nightActions[currentNight].wolf_group || {};
             }
        }
        const chosenWolfAction = wolfActionData.action;
        const wolfVotes = wolfActionData.votes || {};
        const myWolfVote = wolfVotes[myPlayerId];
        
        let individualAction = null;
        if (!actionDetails.isWolfGroupAction && currentNight && roomData.nightActions?.[currentNight]?.[myPlayerId]) {
            let actionSource = roomData.nightActions[currentNight][myPlayerId];
            if(actionSource && actionSource.action === actionDetails.actionKind) {
                individualAction = actionSource;
            }
        }
        const individualTargets = individualAction ? (Array.isArray(individualAction.targets) ? individualAction.targets : []) : [];

        const voteCounts = {};
        if (actionDetails.isWolfGroupAction && chosenWolfAction === actionDetails.actionKind) {
            for (const wolfId in wolfVotes) {
                const targetId = wolfVotes[wolfId];
                voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
            }
        }

        let targetsHTML = '';
        livingPlayers.forEach(([id, player]) => {
            let playerName = player.name;
            if (myPlayerId === id) playerName += " (Bản thân)";
            
            let isSelected = false;
            if(actionDetails.isWolfGroupAction) {
                isSelected = (myWolfVote === id && chosenWolfAction === actionDetails.actionKind);
            } else {
                isSelected = individualTargets.includes(id);
            }
            
            const inputType = targetLimit > 1 ? 'checkbox' : 'radio';
            const voteDisplay = (actionDetails.isWolfGroupAction && voteCounts[id] > 0) ? `<span class="vote-count">(${voteCounts[id]} phiếu)</span>` : '';

            targetsHTML += `
                <div class="target-item" style="display: flex; align-items: center; gap: 8px; padding: 5px; border-radius: 4px;">
                    <input type="${inputType}" id="target-${actionDetails.actionKind}-${id}" name="target-${actionDetails.actionKind}" value="${id}" ${isSelected ? 'checked' : ''}>
                    <label for="target-${actionDetails.actionKind}-${id}" style="width: 100%;">${playerName} ${voteDisplay}</label>
                </div>
            `;
        });
    
        const descriptionText = targetLimit > 1 ? `${actionDetails.description} (Chọn ${targetLimit} mục tiêu)` : actionDetails.description;
        const confirmButtonText = actionDetails.confirmText || 'Xác nhận';
        panel.innerHTML = `
            <h2 class="action-title">${actionDetails.title}</h2>
            <p class="action-description">${descriptionText}</p>
            <div class="choices-grid action-targets-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">${targetsHTML}</div>
            <button class="confirm-action-btn hidden" style="margin-top: 15px;">${confirmButtonText}</button>
            <p class="choice-status-message"></p>
        `;
    
        const targetsContainer = panel.querySelector('.action-targets-container');
        const confirmBtn = panel.querySelector('.confirm-action-btn');
        const statusMsg = panel.querySelector('.choice-status-message');
    
        const isWolfPanelLockedToOtherAction = actionDetails.isWolfGroupAction && chosenWolfAction && chosenWolfAction !== actionDetails.actionKind;
        const isIndividualPanelLocked = !actionDetails.isWolfGroupAction && individualAction;

        if (isWolfPanelLockedToOtherAction) {
            statusMsg.innerHTML = `Bầy Sói đã quyết định <strong>${ALL_ACTIONS[chosenWolfAction]?.label || chosenWolfAction}</strong> trong đêm nay.`;
            targetsContainer.querySelectorAll('input').forEach(input => input.disabled = true);
        } else if (isIndividualPanelLocked) {
            const targetIds = individualAction.targets || [];
            const targetNames = targetIds.map(targetId => {
                const p = livingPlayers.find(([id]) => id === targetId);
                return p ? p[1].name : 'Mục tiêu';
            }).join(', ');

            statusMsg.innerHTML = `Đã xác nhận hành động lên <strong>${targetNames}</strong>.`;
            targetsContainer.querySelectorAll('input').forEach(input => input.disabled = true);
        } else {
            targetsContainer.addEventListener('change', (event) => {
                const checkedBoxes = targetsContainer.querySelectorAll('input:checked');
                if (targetLimit > 1 && checkedBoxes.length > targetLimit) {
                    event.target.checked = false;
                }
                const currentSelectionCount = targetsContainer.querySelectorAll('input:checked').length;
                confirmBtn.classList.toggle('hidden', currentSelectionCount === 0 || currentSelectionCount > targetLimit);
            });
    
            confirmBtn.addEventListener('click', () => {
                const selectedTargets = Array.from(targetsContainer.querySelectorAll('input:checked')).map(cb => cb.value);
                
                if (actionDetails.isWolfGroupAction) {
                    if (selectedTargets.length > 0) {
                        const updates = {};
                        updates[`${actionPath}/action`] = actionDetails.actionKind;
                        updates[`${actionPath}/votes/${myPlayerId}`] = selectedTargets[0];
                        database.ref().update(updates);
                    }
                } else {
                     if (selectedTargets.length > 0 && selectedTargets.length <= targetLimit) {
                        const actionData = {
                            action: actionDetails.actionKind,
                            targets: selectedTargets 
                        };
                        database.ref(actionPath).set(actionData);
                    }
                }
            });
        }
    
        return panel;
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
        await fetchAllRolesData();
        checkSessionAndAutoLogin();
    };
    initialize();
});