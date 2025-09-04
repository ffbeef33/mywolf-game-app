// =================================================================
// === player.js - PHIÊN BẢN CẬP NHẬT CHO MODULE TƯƠNG TÁC ===
console.log("ĐANG CHẠY player.js PHIÊN BẢN CÓ MODULE TƯƠNG TÁC!");

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
    
    // === START: THÊM MỚI DOM ELEMENTS CHO MODULE TƯƠNG TÁC ===
    const interactiveActionSection = document.getElementById('interactive-action-section');
    const actionTitle = document.getElementById('action-title');
    const actionDescription = document.getElementById('action-description');
    const actionTargetsContainer = document.getElementById('action-targets-container');
    const confirmActionButton = document.getElementById('confirm-action-btn');
    const actionStatusMessage = document.getElementById('action-status-message');
    // === END: THÊM MỚI ===

    let roomListener = null;
    let publicWillListener = null;
    let pickTimerInterval = null;
    let voteTimerInterval = null;
    let currentRoomId = null;
    let myPlayerId = null;
    let allRolesData = []; // Dữ liệu vai trò đầy đủ (từ sheet Roles)
    let allRolesKind = {}; // Dữ liệu Kind của vai trò (từ night-note.js)
    let myPlayerData = {}; // Lưu trữ dữ liệu của người chơi hiện tại

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
                kind: (role.Kind || 'empty').trim() // Thêm Kind vào đây
            }));

            // Tạo một map để truy cập Kind dễ dàng hơn
            allRolesKind = allRolesData.reduce((acc, role) => {
                acc[role.name] = role.kind;
                return acc;
            }, {});

        } catch (error)
        {
            console.error("Lỗi nghiêm trọng khi tải dữ liệu vai trò:", error);
        }
    };
    
    const checkSessionAndAutoLogin = () => {
        const username = sessionStorage.getItem('mywolf_username');
        if (username) {
            loginSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playerNameDisplay.textContent = username;
            showSection(waitingSection);
            waitingSection.querySelector('.waiting-message').textContent = "Đang chờ quản trò tạo phòng và thêm bạn vào phòng...";
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
        if (pickTimerInterval) clearInterval(pickTimerInterval);
        if (voteTimerInterval) clearInterval(voteTimerInterval);
        roomListener = publicWillListener = pickTimerInterval = voteTimerInterval = currentRoomId = myPlayerId = null;
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
                attachListenerToSpecificRoom(username, foundRoomId);
            }
        });
    }

    function attachListenerToSpecificRoom(username, roomId) {
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
        }, (error) => {
            console.error("Firebase listener error:", error);
            showSection(waitingSection);
            waitingSection.querySelector('.waiting-message').textContent = "Mất kết nối với phòng chơi.";
        });
        
        const publicWillRef = database.ref(`rooms/${roomId}/publicData/publishedWill`);
        if(publicWillListener) publicWillRef.off('value', publicWillListener);
        publicWillListener = publicWillRef.on('value', (snapshot) => {
            const publishedWill = snapshot.val();
            if (publishedWill && publishedWill.content) {
                showPublishedWill(publishedWill);
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
            waitingSection.querySelector('.waiting-message').textContent = "Bạn đã bị loại khỏi phòng hoặc chưa được thêm vào phòng!";
            return;
        }

        myPlayerId = myPlayerEntry[0]; 
        myPlayerData = myPlayerEntry[1]; 
        
        // Cập nhật trạng thái sống/chết (dựa vào night note nếu có)
        const nightNotes = roomData.nightNotes;
        let isAlive = myPlayerData.isAlive; 
        if (nightNotes && Array.isArray(nightNotes) && nightNotes.length > 0) {
            const lastNight = nightNotes[nightNotes.length - 1];
            if(lastNight.playersStatus && lastNight.playersStatus[myPlayerId]) {
                 isAlive = lastNight.playersStatus[myPlayerId].isAlive;
            }
        }
        
        if (myPlayerData.roleName) {
            playerActionsContainer.classList.remove('hidden');
            openWillModalBtn.disabled = !isAlive;
            openWillModalBtn.textContent = isAlive ? 'Viết Di Chúc' : 'Đã Chết';
        } else {
            playerActionsContainer.classList.add('hidden');
        }

        // === START: LOGIC MỚI CHO MODULE TƯƠNG TÁC ===
        const interactiveState = roomData.interactiveState;
        if (interactiveState && interactiveState.phase === 'night' && isAlive) {
            // Nếu đang là ban đêm và người chơi còn sống -> hiển thị giao diện hành động
            hideAllGameCards();
            displayNightActions(roomData, interactiveState.currentNight);
            return; // Dừng hàm ở đây để không bị các giao diện khác đè lên
        }
        // Nếu không phải ban đêm, đảm bảo giao diện hành động bị ẩn
        interactiveActionSection.classList.add('hidden');
        // === END: LOGIC MỚI ===

        const votingState = roomData.votingState;
        if (votingState && votingState.status === 'active') {
            if (isAlive) {
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

    // === START: HÀM MỚI ĐỂ ẨN TẤT CẢ GAME CARD CHÍNH ===
    function hideAllGameCards() {
         [waitingSection, playerPickSection, roleRevealSection, votingUiSection].forEach(section => {
            section.classList.add('hidden');
        });
    }
    // === END: HÀM MỚI ===
    
    // ... (Các hàm cũ như showRoleDescriptionModal, displayRolesInGame, handlePlayerPickState, handleVotingState, ... giữ nguyên)
    const showRoleDescriptionModal = (roleName) => {
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
    // ... (Các hàm Di Chúc giữ nguyên) ...
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

    // === START: CÁC HÀM MỚI CHO MODULE TƯƠNG TÁC ===

    /**
     * Hiển thị giao diện hành động ban đêm cho người chơi.
     * @param {object} roomData - Toàn bộ dữ liệu của phòng.
     * @param {number} currentNight - Số đêm hiện tại.
     */
    function displayNightActions(roomData, currentNight) {
        interactiveActionSection.classList.remove('hidden');
        actionTargetsContainer.innerHTML = '';
        confirmActionButton.classList.add('hidden');
        actionStatusMessage.textContent = '';

        const myRoleName = myPlayerData.roleName;
        const myKind = allRolesKind[myRoleName] || 'empty';

        if (myKind === 'empty') {
            actionTitle.textContent = "Thư giãn";
            actionDescription.textContent = "Đêm nay bạn không có chức năng đặc biệt. Hãy chờ trời sáng.";
            return;
        }

        actionTitle.textContent = `Chức năng: ${myRoleName}`;
        actionDescription.textContent = "Chọn một người chơi để thực hiện chức năng.";

        const livingPlayers = Object.entries(roomData.players).filter(([id, player]) => player.isAlive);
        
        let selectedTargetId = null;

        livingPlayers.forEach(([id, player]) => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = player.name;
            btn.dataset.targetId = id;

            // Xử lý việc tự chọn bản thân
            if (myPlayerId === id) {
                btn.textContent += " (Bản thân)";
            }

            btn.addEventListener('click', () => {
                // Bỏ chọn nút cũ
                actionTargetsContainer.querySelector('.selected')?.classList.remove('selected');
                // Chọn nút mới
                btn.classList.add('selected');
                selectedTargetId = id;
                confirmActionButton.classList.remove('hidden');
            });
            actionTargetsContainer.appendChild(btn);
        });
        
        // Gán sự kiện cho nút xác nhận
        // Phải clone và replace để xóa listener cũ, tránh bị gọi nhiều lần
        const newConfirmBtn = confirmActionButton.cloneNode(true);
        newConfirmBtn.addEventListener('click', () => {
            if (selectedTargetId) {
                submitNightAction(myKind, selectedTargetId, currentNight);
            }
        });
        confirmActionButton.parentNode.replaceChild(newConfirmBtn, confirmActionButton);
    }

    /**
     * Gửi hành động của người chơi lên Firebase.
     * @param {string} actionKind - Loại hành động (vd: 'shield', 'check').
     * @param {string} targetId - ID của người chơi được chọn làm mục tiêu.
     * @param {number} currentNight - Số đêm hiện tại.
     */
    function submitNightAction(actionKind, targetId, currentNight) {
        const actionPath = `rooms/${currentRoomId}/nightActions/${currentNight}/${myPlayerId}`;
        
        // Dựa vào Kind để tạo object action
        // Đây là phiên bản đơn giản, sau này có thể mở rộng cho các vai trò có nhiều chức năng
        const actionData = {
            action: actionKind, // Sẽ tương ứng với key trong KIND_TO_ACTION_MAP của night-note
            target: targetId,
            actorName: myPlayerData.name,
            roleName: myPlayerData.roleName
        };

        database.ref(actionPath).set(actionData)
            .then(() => {
                actionStatusMessage.textContent = "Đã gửi hành động thành công! Đang chờ những người khác...";
                // Vô hiệu hóa các nút sau khi đã chọn
                actionTargetsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);
                document.getElementById('confirm-action-btn').disabled = true;
            })
            .catch(error => {
                actionStatusMessage.textContent = "Lỗi! Không thể gửi hành động: " + error.message;
            });
    }

    // === END: CÁC HÀM MỚI ===

    // --- EVENT LISTENERS ---
    roleRevealSection.addEventListener('click', () => roleRevealSection.classList.toggle('is-flipped'));
    randomChoiceBtn.addEventListener('click', () => {
        if (currentRoomId) {
            const username = sessionStorage.getItem('mywolf_username');
            if (username) selectRole(username, currentRoomId, 'random');
        }
    });
    roleDescriptionModal.addEventListener('click', (event) => {
        if (event.target === roleDescriptionModal || event.target.classList.contains('close-modal-btn')) {
            roleDescriptionModal.classList.add('hidden');
        }
    });
    openWillModalBtn.addEventListener('click', openWillModal);
    willTextarea.addEventListener('input', updateWordCount);
    saveWillBtn.addEventListener('click', saveWill);
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