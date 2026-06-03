import { CONFIG } from './config.js';

export const Auth = {
  user: null,
  onLoginSuccessCallback: null,

  init(onLoginSuccess) {
    this.onLoginSuccessCallback = onLoginSuccess;

    // Kiểm tra trong LocalStorage xem đã đăng nhập chưa
    const storedUser = localStorage.getItem('fwc_user');
    if (storedUser) {
      try {
        this.user = JSON.parse(storedUser);
        if (this.onLoginSuccessCallback) {
          this.onLoginSuccessCallback(this.user);
        }
        return;
      } catch (e) {
        console.error('Lỗi load user từ localStorage', e);
        localStorage.removeItem('fwc_user');
      }
    }

    // Nếu chưa đăng nhập, khởi tạo nút Google Sign-In
    if (CONFIG.GOOGLE_CLIENT_ID) {
      if (typeof google !== 'undefined' && google.accounts) {
        this.initGoogleSignIn();
      } else {
        // Chờ thư viện Google load xong (cực kỳ quan trọng cho mạng di động chậm)
        const interval = setInterval(() => {
          if (typeof google !== 'undefined' && google.accounts) {
            clearInterval(interval);
            this.initGoogleSignIn();
          }
        }, 100);
        setTimeout(() => clearInterval(interval), 10000); // Ngừng kiểm tra sau 10 giây
      }
    } else {
      console.warn('Chưa cấu hình VITE_GOOGLE_CLIENT_ID trong file .env');
      const btnContainer = document.getElementById('google-signin-btn');
      if (btnContainer) {
        btnContainer.innerHTML = '<div style="color: #e74c3c; font-size: 0.85rem; padding: 10px; border: 1px dashed #e74c3c; border-radius: 8px; background: rgba(231,76,60,0.1); text-align: center;">⚠️ Lỗi: Thiếu VITE_GOOGLE_CLIENT_ID (cần cấu hình trên Netlify hoặc .env)</div>';
      }
    }
  },

  initGoogleSignIn() {
    try {
      google.accounts.id.initialize({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        callback: this.handleCredentialResponse.bind(this)
      });
      this.renderButton();
    } catch (error) {
      console.error('Lỗi khởi tạo Google Identity Services:', error);
    }
  },

  renderButton() {
    const btnContainer = document.getElementById('google-signin-btn');
    if (btnContainer) {
      google.accounts.id.renderButton(btnContainer, {
        theme: 'filled_blue',
        size: 'large',
        type: 'standard',
        shape: 'pill',
        text: 'signin_with',
        logo_alignment: 'left'
      });
    }
  },

  handleCredentialResponse(response) {
    try {
      const payload = this.parseJwt(response.credential);
      
      this.user = {
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      };

      // Lưu vào LocalStorage
      localStorage.setItem('fwc_user', JSON.stringify(this.user));

      if (this.onLoginSuccessCallback) {
        this.onLoginSuccessCallback(this.user);
      }
    } catch (error) {
      console.error('Lỗi parse Google JWT token:', error);
      alert('Đăng nhập thất bại. Vui lòng thử lại!');
    }
  },

  parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  },

  signOut() {
    localStorage.removeItem('fwc_user');
    this.user = null;
    
    // Thu hồi đăng nhập của Google
    try {
      google.accounts.id.disableAutoSelect();
    } catch (e) {}

    // Reload trang để reset state ứng dụng
    window.location.reload();
  },

  getUser() {
    return this.user;
  },

  isAuthenticated() {
    return this.user !== null;
  }
};
