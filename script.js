document.addEventListener('DOMContentLoaded', function() {
    // --- Các phần tử DOM ---
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    
    const loginButton = document.getElementById('loginButton');
    const playerPassword = document.getElementById('playerPassword');
    const loginError = document.getElementById('loginError');

    const registerButton = document.getElementById('registerButton');
    const newUsername = document.getElementById('newUsername');
    const newPassword = document.getElementById('newPassword');
    const registerMessage = document.getElementById('registerMessage');

    const showRegisterLink = document.getElementById('show-register-link');
    const showLoginLink = document.getElementById('show-login-link');
    
    const adminButton = document.getElementById('adminButton');
    const adminPassword = document.getElementById('adminPassword');

    // --- Chức năng chuyển đổi giữa form Đăng nhập và Đăng ký ---
    // Sửa lỗi: Kiểm tra phần tử tồn tại trước khi gán sự kiện
    if (showRegisterLink && showLoginLink && loginView && registerView) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginView.classList.add('hidden');
            registerView.classList.remove('hidden');
            loginError.textContent = '';
            registerMessage.textContent = '';
        });

        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            registerView.classList.add('hidden');
            loginView.classList.remove('hidden');
            loginError.textContent = '';
            registerMessage.textContent = '';
        });
    }

    // --- Xử lý Đăng ký người chơi mới ---
    const handleRegister = () => {
        const username = newUsername.value.trim();
        const password = newPassword.value.trim();

        if (!username || !password) {
            registerMessage.textContent = 'Tên và mật khẩu không được để trống.';
            registerMessage.classList.add('error-message');
            registerMessage.classList.remove('message');
            return;
        }
        registerMessage.textContent = '';
        registerButton.disabled = true;
        registerButton.textContent = 'Đang xử lý...';

        fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register', username, password })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                registerMessage.textContent = 'Đăng ký thành công! Đang chuyển về trang đăng nhập...';
                registerMessage.classList.remove('error-message');
                registerMessage.classList.add('message');
                setTimeout(() => {
                    playerPassword.value = password; // Tự điền mật khẩu vừa tạo
                    if (showLoginLink) showLoginLink.click();
                    loginError.textContent = 'Hãy đăng nhập với mật khẩu vừa tạo.';
                }, 2000);
            } else {
                registerMessage.textContent = data.message || 'Đã có lỗi xảy ra.';
                registerMessage.classList.add('error-message');
                registerMessage.classList.remove('message');
            }
        })
        .catch(err => {
            console.error('Error:', err);
            registerMessage.textContent = 'Lỗi kết nối máy chủ.';
            registerMessage.classList.add('error-message');
            registerMessage.classList.remove('message');
        })
        .finally(() => {
            registerButton.disabled = false;
            registerButton.textContent = 'Tạo Tài Khoản';
        });
    };

    // Sửa lỗi: Kiểm tra phần tử tồn tại trước khi gán sự kiện
    if (registerButton && newPassword && newUsername) {
        registerButton.addEventListener('click', handleRegister);
        newPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });
        newUsername.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });
    }

    // --- Xử lý đăng nhập người chơi ---
    const handleLogin = () => {
        const password = playerPassword.value;
        if (!password) {
            loginError.textContent = 'Vui lòng nhập mật khẩu!';
            return;
        }
        loginError.textContent = '';
        
        fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', password: password, type: 'player' })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.username) {
                sessionStorage.setItem('mywolf_username', data.username);
                window.location.href = 'player.html';
            } else {
                loginError.textContent = data.message || 'Mật khẩu không chính xác!';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            loginError.textContent = 'Có lỗi xảy ra khi đăng nhập!';
        });
    };

    // Sửa lỗi: Kiểm tra phần tử tồn tại trước khi gán sự kiện
    if (loginButton && playerPassword) {
        loginButton.addEventListener('click', handleLogin);
        playerPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    }

    // --- Xử lý đăng nhập quản trò ---
    const handleAdminLogin = () => {
        const password = adminPassword.value;
        if (password) {
            fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'login', password: password, type: 'admin' })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window.location.href = 'admin.html';
                } else {
                    alert('Mật khẩu quản trò không chính xác!');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Có lỗi xảy ra khi đăng nhập!');
            });
        } else {
            alert('Vui lòng nhập mật khẩu quản trò!');
        }
    };
    
    // Sửa lỗi: Kiểm tra phần tử tồn tại trước khi gán sự kiện
    if (adminButton && adminPassword) {
        adminButton.addEventListener('click', handleAdminLogin);
        adminPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAdminLogin(); });
    }
});