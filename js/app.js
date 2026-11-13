// ============================================================
// CBT BAHASA — app.js (Single Page Application Client)
// Arsitektur: Frontend Modern SPA + REST API Backend (Node.js & PostgreSQL)
// ============================================================

// ════════════════════════════════════════════════════════
    // STATE GLOBAL
    // ════════════════════════════════════════════════════════
    const appState = {
      participant: null,        // { ID_Peserta, Nama, Kontak, ID_Ujian_Target }
      staff: null,               // { ID_Dosen/ID_Admin, Nama, Email, role }
      currentExam: null,         // ujian object saat sesi berjalan
      examQuestions: [],         // soal (tanpa jawaban benar)
      currentQuestionIndex: 0,
      answers: {},                // { ID_Soal: 'A' }
      flaggedQuestions: {},       // { ID_Soal: true } (soal ragu-ragu)
      audioPlayCounts: {},        // { ID_Soal: count } (frekuensi putar audio)
      audioMaxPlayLimit: 2,       // batas putar maksimal per audio (standar ujian)
      cheatViolations: 0,         // hitungan pelanggaran pindah tab / keluar fullscreen
      maxCheatViolations: 3,      // toleransi maksimal sebelum auto-submit
      cheatAuditLogs: [],         // log audit pelanggaran peserta
      fontScale: localStorage.getItem('cbt_font_scale') || 'md', // 'sm', 'md', 'lg'
      pendingExamIdForLaunch: null,
      autoSyncInterval: null,
      examStartTimeISO: null,
      timerInterval: null,
      timerSecondsLeft: 0,
      staffRole: 'admin',
      editingExamId: null,
      csvParsedQuestions: [],
      chartInstances: {},
      currentQuestionSesiForForm: null // dipakai form Kelola Soal
    };
    
    // ════════════════════════════════════════════════════════
    // I18N — KAMUS TERJEMAHAN (Indonesia / English)
    // Cakupan: label & judul utama antarmuka (chrome), bukan seluruh konten
    // dinamis (mis. isi tabel/toast) — lihat catatan di ringkasan pengembangan.
    // ════════════════════════════════════════════════════════
    const I18N = {
      id: {
        entryTitle: 'Isi Data Diri untuk Memulai', entrySubtitle: 'Lengkapi data diri dan kode akses untuk memulai sesi ujian kebahasaan.',
        staffLoginTitle: 'Login Staf', staffLoginSubtitle: 'Portal Khusus Dosen Penguji & Administrator',
        hAvailableExams: 'Ujian Tersedia', hReviewAnswers: 'Tinjau Jawaban Anda', pReviewAnswers: 'Pastikan seluruh soal terisi sebelum submit final.',
        hExamCompleted: 'Ujian Selesai!', hMyExams: 'Ujian Saya', pMyExams: 'Kelola paket ujian kebahasaan yang Anda buat.',
        hAdminDashboard: 'Dashboard Admin — Pusat Layanan Bahasa', pAdminDashboard: 'Ringkasan operasional sistem CBT secara real-time.',
        hManageLecturers: 'Manajemen Staf & Akses Email', pManageLecturers: 'Kelola daftar email Administrator dan Dosen Penguji yang diizinkan masuk langsung ke sistem CBT.',
        hManageParticipants: 'Manajemen Peserta & Kode Akses', pManageParticipants: 'Kelola token peserta agar sesi ujian tetap privat per-rombel.',
        hManageExams: 'Katalog & Pengawasan Semua Ujian', pManageExams: 'Pantau seluruh ujian yang dibuat oleh semua dosen.',
        hReports: 'Laporan Hasil & Rekapitulasi Global', pReports: 'Ekspor rekapan nilai terstandar institusi.',
        hActivityLog: 'Log Aktivitas & Audit Keamanan Sistem', pActivityLog: 'Rekam jejak kronologis seluruh aktivitas sistem.',
        hSettings: 'Pengaturan Sistem & Parameter Ujian', pSettings: 'Konfigurasi ambang kelulusan standar dan durasi default.',
        hManageQuestions: 'Kelola Soal',
        lblFullName: 'Nama Lengkap', lblAccessCode: 'Kode Akses (Diberikan Admin)', btnContinue: 'Lanjutkan / Mulai Sesi',
        lblStaffEmail: 'Email Terdaftar', hintPasswordlessEmail: 'Masuk langsung menggunakan email yang terdaftar di sistem tanpa kata sandi.', btnStaffLogin: 'Masuk dengan Email',
        lblTimeLeft: 'Sisa Waktu', lblQuestionNav: 'Navigasi Soal', btnReviewAll: 'Tinjau Semua Jawaban',
        btnSubmitFinal: 'Selesaikan & Kirim Ujian (Submit Final)', lblTotalScore: 'Total Nilai Konversi (Skor TOEFL)',
        btnBackToStart: 'Kembali ke Awal', btnCreateExam: 'Buat Ujian Baru',
        navDashboard: 'Dashboard', navMyExamsAdmin: 'Ujian Saya (Admin)', navMyExams: 'My Exams', navLecturers: 'Staf & Akses Email',
        navParticipants: 'Peserta & Kode Akses', navCatalog: 'Katalog Ujian', navReports: 'Laporan & Rekap',
        navActivityLog: 'Log Aktivitas', navSettings: 'Pengaturan Sistem', navBankSoal: 'Bank Soal', navRombel: 'Perbandingan Rombel'
      },
      en: {
        entryTitle: 'Enter Your Details to Start', entrySubtitle: 'Complete your details and access code to begin the language exam session.',
        staffLoginTitle: 'Staff Login', staffLoginSubtitle: 'Portal for Lecturers & Administrators',
        hAvailableExams: 'Available Exams', hReviewAnswers: 'Review Your Answers', pReviewAnswers: 'Make sure all questions are answered before final submit.',
        hExamCompleted: 'Exam Completed!', hMyExams: 'My Exams', pMyExams: 'Manage the language exam packages you have created.',
        hAdminDashboard: 'Admin Dashboard — Language Service Center', pAdminDashboard: 'Real-time operational summary of the CBT system.',
        hManageLecturers: 'Staff & Email Access Management', pManageLecturers: 'Manage registered Administrator and Lecturer email addresses allowed to sign in directly to the CBT system.',
        hManageParticipants: 'Participant & Access Code Management', pManageParticipants: 'Manage participant tokens to keep exam sessions private per class.',
        hManageExams: 'Exam Catalog & Oversight', pManageExams: 'Monitor all exams created by every lecturer.',
        hReports: 'Global Results Report & Recap', pReports: 'Export standardized institutional score recap.',
        hActivityLog: 'Activity Log & Security Audit', pActivityLog: 'Chronological record of all system activity.',
        hSettings: 'System Settings & Exam Parameters', pSettings: 'Configure default passing score and duration standards.',
        hManageQuestions: 'Manage Questions',
        lblFullName: 'Full Name', lblAccessCode: 'Access Code (Provided by Admin)', btnContinue: 'Continue / Start Session',
        lblStaffEmail: 'Registered Email', hintPasswordlessEmail: 'Sign in directly using your registered staff email without a password.', btnStaffLogin: 'Sign in with Email',
        lblTimeLeft: 'Time Remaining', lblQuestionNav: 'Question Navigator', btnReviewAll: 'Review All Answers',
        btnSubmitFinal: 'Finish & Submit Exam (Final Submit)', lblTotalScore: 'Total Converted Score (TOEFL Score)',
        btnBackToStart: 'Return to Start', btnCreateExam: 'Create New Exam',
        navDashboard: 'Dashboard', navMyExamsAdmin: 'My Exams (Admin)', navMyExams: 'My Exams', navLecturers: 'Staff & Email Access',
        navParticipants: 'Participants & Codes', navCatalog: 'Exam Catalog', navReports: 'Reports & Recap',
        navActivityLog: 'Activity Log', navSettings: 'System Settings', navBankSoal: 'Question Bank', navRombel: 'Cohort Comparison'
      }
    };
    
    function getCurrentLang() { return localStorage.getItem('cbt_lang') || 'id'; }
    
    function applyLanguage(lang) {
      const dict = I18N[lang] || I18N.id;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key] !== undefined) el.textContent = dict[key];
      });
      document.querySelectorAll('[id^="langToggleLabel"]').forEach(el => el.textContent = lang.toUpperCase());
      // Nav sidebar staf dirender ulang agar labelnya ikut berganti bahasa
      if (appState.staff) renderStaffSidebar(appState.staff.role);
    }
    
    function toggleLanguage() {
      const current = getCurrentLang();
      const next = current === 'id' ? 'en' : 'id';
      localStorage.setItem('cbt_lang', next);
      applyLanguage(next);
      showToast(next === 'id' ? 'Bahasa Diubah' : 'Language Changed', next === 'id' ? 'Antarmuka kini dalam Bahasa Indonesia.' : 'Interface is now in English.', 'success');
    }
    
    // ════════════════════════════════════════════════════════
    // DARK MODE
    // ════════════════════════════════════════════════════════
    function getCurrentTheme() { return localStorage.getItem('cbt_theme') || 'light'; }
    
    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      document.querySelectorAll('[id^="themeToggleIcon"]').forEach(el => {
        el.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
      });
    }
    
    function toggleTheme() {
      const current = getCurrentTheme();
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('cbt_theme', next);
      applyTheme(next);
    }
    
    // ════════════════════════════════════════════════════════
    // INIT
    // ════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', () => {
      applyTheme(getCurrentTheme());
      applyLanguage(getCurrentLang());
    
      setTimeout(() => {
        document.getElementById('loadingOverlay').classList.add('hide');
      }, 500);
    
      // Cek versi build aktif di console internal (tidak ditampilkan di UI agar bersih)
      gasRun.withSuccessHandler(res => {
        if (res && res.success) {
          console.log('[CBT Bahasa] Server Build Active:', res.data.version);
        }
      }).getAppVersion();
      
      // Muat konfigurasi pengaturan sistem yang tersimpan agar langsung aktif
      try {
        const cachedSettings = localStorage.getItem('cbt_system_settings');
        if (cachedSettings) applyLoadedSettings(JSON.parse(cachedSettings));
      } catch(e){}
    
      // Pulihkan sesi dari localStorage agar refresh halaman tidak memaksa logout
      // (penting terutama untuk Admin/Dosen yang sedang memantau dashboard).
      restoreSession();
    });
    
    function restoreSession() {
      try {
        const savedStaff = localStorage.getItem('cbt_staff');
        const savedParticipant = localStorage.getItem('cbt_participant');
    
        if (savedStaff) {
          appState.staff = JSON.parse(savedStaff);
          renderStaffSidebar(appState.staff.role);
          document.getElementById('staffNameLabel').textContent = appState.staff.Nama;
          document.getElementById('staffRoleLabel').textContent = appState.staff.role === 'admin' ? 'Administrator' : 'Dosen Penguji';
          document.getElementById('staffAvatar').textContent = appState.staff.Nama.charAt(0).toUpperCase();
          document.getElementById('staffPortalLabel').textContent = appState.staff.role === 'admin' ? 'Admin Portal' : 'Dosen Portal';
          showView('view-staff-app');
          navigateTo(appState.staff.role === 'admin' ? 'adminDashboard' : 'dosenDashboard');
          return;
        }
    
        if (savedParticipant) {
          appState.participant = JSON.parse(savedParticipant);
          document.getElementById('participantNameLabel').textContent = appState.participant.Nama;
          document.getElementById('participantAvatar').textContent = appState.participant.Nama.charAt(0).toUpperCase();
          showView('view-participant-app');
    
          // Jika ada ujian yang belum diselesaikan sebelum refresh/tab tertutup,
          // langsung lanjutkan otomatis (progres jawaban & sisa waktu dipulihkan).
          const activeExamId = localStorage.getItem('cbt_active_exam_id');
          if (activeExamId) {
            beginExam(activeExamId);
          } else {
            loadAvailableExams();
          }
          return;
        }
    
        showView('view-participant-entry');
      } catch (e) {
        showView('view-participant-entry');
      }
    }
    
    function showView(viewId) {
      ['view-participant-entry','view-staff-login','view-participant-app','view-staff-app'].forEach(v => {
        document.getElementById(v).style.display = (v === viewId) ? '' : 'none';
      });
    }
    
    // ════════════════════════════════════════════════════════
    // TOAST
    // ════════════════════════════════════════════════════════
    function showToast(title, msg, type) {
      const container = document.getElementById('toastContainer');
      const el = document.createElement('div');
      el.className = 'toast-cbt ' + (type || '');
      const icon = type === 'success' ? 'bi-check-circle-fill' : type === 'danger' ? 'bi-x-circle-fill' : type === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill';
      el.innerHTML = `<i class="bi ${icon}" style="font-size:18px;margin-top:1px;"></i><div><div style="font-weight:700;font-size:13.5px;">${title}</div><div style="font-size:12.5px;color:var(--text-muted);">${msg}</div></div>`;
      container.appendChild(el);
      setTimeout(() => el.remove(), 4500);
    }
    
    function openModal(id) { document.getElementById(id).classList.add('show'); }
    function closeModal(id) { document.getElementById(id).classList.remove('show'); }
    
    // ════════════════════════════════════════════════════════
    // ════════════════════════════════════════════════════════
    // AUTH — DYNAMIC TAB SWITCHING & MOTION GRAPHICS
    // ════════════════════════════════════════════════════════
    function switchAuthTab(targetTab) {
      const isStaff = targetTab === 'staff';
      const currentViewId = isStaff ? 'view-participant-entry' : 'view-staff-login';
      const targetViewId = isStaff ? 'view-staff-login' : 'view-participant-entry';

      const currentView = document.getElementById(currentViewId);
      if (currentView) {
        const currentContainer = currentView.querySelector('.auth-form-container');
        if (currentContainer) {
          currentContainer.classList.add('auth-card-exit');
        }
      }

      setTimeout(() => {
        showView(targetViewId);
        const targetView = document.getElementById(targetViewId);
        if (targetView) {
          const newContainer = targetView.querySelector('.auth-form-container');
          if (newContainer) {
            newContainer.classList.remove('auth-card-exit');
            newContainer.classList.add('auth-card-enter');
            setTimeout(() => newContainer.classList.remove('auth-card-enter'), 400);
          }
        }
      }, 160);
    }

    function togglePasswordVisibility(inputId, btn) {
      const input = document.getElementById(inputId);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = isPass ? 'bi bi-eye-slash' : 'bi bi-eye';
      }
    }

    // AUTH — PESERTA
    // ════════════════════════════════════════════════════════
    function handleParticipantEntry(e) {
      e.preventDefault();
      const nama = document.getElementById('pNama').value.trim();
      const kontak = document.getElementById('pKontak').value.trim();
      const kode = document.getElementById('pKode').value.trim().toUpperCase();
      const errBox = document.getElementById('entryError');
      errBox.style.display = 'none';
    
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.innerHTML = 'Memverifikasi...';

      const saved = localStorage.getItem('cbt_participant');
      let existingToken = '';
      try { existingToken = saved ? JSON.parse(saved).token || '' : ''; } catch (err) {}
      const deviceInfo = `${navigator.platform || 'Device'} — ${navigator.userAgent.substring(0, 80)}`;
    
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          btn.disabled = false; btn.innerHTML = 'Continue / Mulai Sesi <i class="bi bi-arrow-right"></i>';
          if (res.success) {
            appState.participant = res.data;
            localStorage.setItem('cbt_participant', JSON.stringify(res.data));
            document.getElementById('participantNameLabel').textContent = res.data.Nama;
            document.getElementById('participantAvatar').textContent = res.data.Nama.charAt(0).toUpperCase();
            showView('view-participant-app');
            loadAvailableExams();
          } else {
            errBox.innerHTML = '<i class="bi bi-exclamation-triangle-fill" style="margin-right:6px;"></i> ' + escapeHtml(res.message); errBox.style.display = 'block';
          }
        })
        .withFailureHandler(err => { btn.disabled = false; btn.innerHTML = 'Continue / Mulai Sesi'; showToast('Error', err.message, 'danger'); })
        .verifyParticipantAccess(nama, kontak, kode, deviceInfo, existingToken);
    }
    
    function logoutParticipant() {
      appState.participant = null;
      localStorage.removeItem('cbt_participant');
      disableExamProtection();
      document.getElementById('formParticipantEntry').reset();
      showView('view-participant-entry');
    }
    
    // ════════════════════════════════════════════════════════
    // AUTH — STAFF
    // ════════════════════════════════════════════════════════
    function setStaffRole(role) {
      appState.staffRole = role;
      document.getElementById('btnRoleAdmin').classList.toggle('active', role === 'admin');
      document.getElementById('btnRoleDosen').classList.toggle('active', role === 'dosen');
      const emailInput = document.getElementById('sEmail');
      if (emailInput) {
        emailInput.placeholder = role === 'admin' ? 'admin@cbtbahasa.id' : 'dosen.aris@cbtbahasa.id';
      }
      const errBox = document.getElementById('staffLoginError');
      if (errBox) errBox.style.display = 'none';
    }
    
    function handleStaffLogin(e) {
      e.preventDefault();
      const email = document.getElementById('sEmail').value.trim().toLowerCase();
      const errBox = document.getElementById('staffLoginError');
      errBox.style.display = 'none';
      const btn = e.target.querySelector('button[type="submit"]');
      const restoreLoginBtn = () => {
        btn.disabled = false;
        const lang = typeof getCurrentLang === 'function' ? getCurrentLang() : 'id';
        const label = (I18N[lang] && I18N[lang].btnStaffLogin) || 'Masuk dengan Email';
        btn.innerHTML = `<i class="bi bi-box-arrow-in-right"></i> <span data-i18n="btnStaffLogin">${label}</span>`;
      };
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Memverifikasi Email...';
    
      gasRun
        .withSuccessHandler(res => {
          restoreLoginBtn();
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (res.success) {
            appState.staff = res.data;
            localStorage.setItem('cbt_staff', JSON.stringify(res.data));
            renderStaffSidebar(res.data.role);
            document.getElementById('staffNameLabel').textContent = res.data.Nama;
            document.getElementById('staffRoleLabel').textContent = res.data.role === 'admin' ? 'Administrator' : 'Dosen Penguji';
            document.getElementById('staffAvatar').textContent = res.data.Nama.charAt(0).toUpperCase();
            document.getElementById('staffPortalLabel').textContent = res.data.role === 'admin' ? 'Admin Portal' : 'Dosen Portal';
            showView('view-staff-app');
            navigateTo(res.data.role === 'admin' ? 'adminDashboard' : 'dosenDashboard');
          } else {
            errBox.innerHTML = '<i class="bi bi-exclamation-triangle-fill" style="margin-right:6px;"></i> ' + escapeHtml(res.message); errBox.style.display = 'block';
          }
        })
        .withFailureHandler(err => { restoreLoginBtn(); showToast('Error', err.message, 'danger'); })
        .staffLogin(appState.staffRole, email);
    }
    
    function logoutStaff() {
      appState.staff = null;
      localStorage.removeItem('cbt_staff');
      showView('view-staff-login');
    }
    
    const NAV_MENUS = {
      admin: [
        { id: 'adminDashboard', icon: 'bi-speedometer2', i18n: 'navDashboard', label: 'Dashboard' },
        { id: 'dosenDashboard', icon: 'bi-journal-text', i18n: 'navMyExamsAdmin', label: 'Ujian Saya (Admin)' },
        { id: 'bankSoal', icon: 'bi-collection', i18n: 'navBankSoal', label: 'Bank Soal' },
        { id: 'manageLecturers', icon: 'bi-people', i18n: 'navLecturers', label: 'Manajemen Staf & Email' },
        { id: 'manageParticipants', icon: 'bi-key', i18n: 'navParticipants', label: 'Peserta & Kode Akses' },
        { id: 'manageExams', icon: 'bi-journal-bookmark', i18n: 'navCatalog', label: 'Katalog Ujian' },
        { id: 'reports', icon: 'bi-bar-chart', i18n: 'navReports', label: 'Laporan & Rekap' },
        { id: 'rombelComparison', icon: 'bi-bar-chart-steps', i18n: 'navRombel', label: 'Perbandingan Rombel' },
        { id: 'activityLog', icon: 'bi-shield-check', i18n: 'navActivityLog', label: 'Log Aktivitas' },
        { id: 'systemSettings', icon: 'bi-sliders', i18n: 'navSettings', label: 'Pengaturan Sistem' }
      ],
      dosen: [
        { id: 'dosenDashboard', icon: 'bi-journal-text', i18n: 'navMyExams', label: 'My Exams' },
        { id: 'bankSoal', icon: 'bi-collection', i18n: 'navBankSoal', label: 'Bank Soal' }
      ]
    };
    
    function renderStaffSidebar(role) {
      const menu = NAV_MENUS[role];
      const dict = I18N[getCurrentLang()] || I18N.id;
      document.getElementById('staffNavMenu').innerHTML = menu.map(m =>
        `<a href="#" data-section="${m.id}" onclick="navigateTo('${m.id}');return false;"><i class="bi ${m.icon}"></i><span>${dict[m.i18n] || m.label}</span></a>`
      ).join('');
      // pertahankan status aktif menu setelah re-render (mis. saat ganti bahasa)
      const activeSection = document.querySelector('.content-section.active');
      if (activeSection) {
        const activeId = activeSection.id.replace('section-', '');
        document.querySelectorAll('#staffNavMenu a').forEach(a => a.classList.toggle('active', a.dataset.section === activeId));
      }
    }
    
    // ════════════════════════════════════════════════════════
    // SPA NAVIGATION
    // ════════════════════════════════════════════════════════
    function navigateTo(sectionId) {
      document.querySelectorAll('.content-section').forEach(s => {
        s.classList.remove('active', 'page-enter-active');
      });
      const target = document.getElementById('section-' + sectionId);
      if (target) {
        target.classList.add('active');
        void target.offsetWidth; // Restart CSS keyframe animation for dynamic motion graphics
        target.classList.add('page-enter-active');
      }

      const parentNavMap = {
        createExam: 'dosenDashboard',
        uploadCSV: 'dosenDashboard',
        manageQuestions: 'dosenDashboard',
        examResultsDosen: 'dosenDashboard',
        itemAnalysis: 'dosenDashboard'
      };
      const activeNavId = parentNavMap[sectionId] || sectionId;
      document.querySelectorAll('#staffNavMenu a').forEach(a => a.classList.toggle('active', a.dataset.section === activeNavId));
      document.getElementById('staffSidebar').classList.remove('show');
      window.scrollTo(0, 0);
    
      const loaders = {
        dosenDashboard: loadDosenDashboard,
        adminDashboard: loadAdminDashboard,
        manageLecturers: loadLecturers,
        manageParticipants: loadParticipants,
        manageExams: loadAllExamsAdmin,
        reports: loadGlobalReport,
        activityLog: loadActivityLog,
        systemSettings: loadSystemSettings,
        createExam: prepareCreateExamForm,
        bankSoal: initBankSoalPage,
        rombelComparison: initRombelComparisonPage
      };
      if (loaders[sectionId]) loaders[sectionId]();
    }
    
    // ════════════════════════════════════════════════════════
    // PESERTA — DAFTAR UJIAN
    // ════════════════════════════════════════════════════════
    function loadAvailableExams() {
      document.getElementById('examListContainer').innerHTML = `<div class="skeleton" style="height:140px;margin-bottom:14px;"></div><div class="skeleton" style="height:140px;"></div>`;
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) { showToast('Error', res.message, 'danger'); return; }
          renderExamList(res.data);
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getAvailableExamsForParticipant(appState.participant.ID_Ujian_Target);
    }
    
    function renderExamList(exams) {
      const wrap = document.getElementById('examListContainer');
      if (!exams.length) {
        wrap.innerHTML = `<div class="empty-state"><i class="bi bi-calendar-x"></i>Belum ada ujian yang tersedia untuk Anda saat ini.</div>`;
        return;
      }
      wrap.innerHTML = exams.map(u => {
        const statusMap = {
          Open: { cls: 'badge-success', label: 'Open / Berlangsung' },
          Upcoming: { cls: 'badge-warning', label: 'Upcoming' },
          Closed: { cls: 'badge-neutral', label: 'Ditutup' },
          Draft: { cls: 'badge-neutral', label: 'Belum Dirilis' }
        };
        const st = statusMap[u.displayStatus] || statusMap.Draft;
        const canStart = u.displayStatus === 'Open';
        return `
          <div class="card-cbt hoverable" style="margin-bottom:16px;border-left:4px solid ${canStart ? 'var(--primary)' : 'var(--border-color)'};">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">
              <div style="flex:1;min-width:240px;">
                <span class="badge-pill ${st.cls}" style="margin-bottom:8px;"><span class="dot"></span>${st.label}</span>
                <h3 style="margin:4px 0;">${u.Nama_Ujian}</h3>
                <p style="color:var(--text-muted);font-size:13.5px;">${u.Deskripsi || ''}</p>
                <div style="display:flex;gap:16px;font-size:12.5px;color:var(--text-muted);margin-top:6px;">
                  <span><i class="bi bi-clock"></i> ${u.Durasi_Menit} menit</span>
                  <span><i class="bi bi-flag"></i> Passing Score: ${u.Passing_Score}</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;">
                <button class="btn-cbt ${canStart ? 'btn-cbt-primary' : 'btn-cbt-ghost'}" ${canStart ? '' : 'disabled'} onclick="prepareLaunchExam('${u.ID_Ujian}')">
                  ${canStart ? '<i class="bi bi-play-fill"></i> Mulai Ujian' : 'Belum Tersedia'}
                </button>
              </div>
            </div>
          </div>`;
      }).join('');
    }
    
    // ════════════════════════════════════════════════════════
    // PESERTA — SESI UJIAN & STANDAR KEBAHASAAN
    // ════════════════════════════════════════════════════════
    // Kunci localStorage untuk auto-save progres ujian (namespaced per ujian
    // agar tidak bentrok jika peserta pernah mengerjakan >1 ujian di browser yang sama).
    function getDraftAnswersKey(idUjian) { return `cbt_draft_answers_${idUjian}`; }
    function getQIndexKey(idUjian) { return `cbt_current_qindex_${idUjian}`; }
    function getFlaggedKey(idUjian) { return `cbt_flagged_${idUjian}`; }
    function getAudioKey(idUjian) { return `cbt_audio_plays_${idUjian}`; }
    function getCheatKey(idUjian) { return `cbt_cheat_count_${idUjian}`; }
    function getCheatLogsKey(idUjian) { return `cbt_cheat_logs_${idUjian}`; }
    
    function clearActiveExamStorage(idUjian) {
      localStorage.removeItem('cbt_active_exam_id');
      localStorage.removeItem('cbt_active_exam_data');
      if (idUjian) {
        localStorage.removeItem(getDraftAnswersKey(idUjian));
        localStorage.removeItem(getQIndexKey(idUjian));
        localStorage.removeItem(getFlaggedKey(idUjian));
        localStorage.removeItem(getAudioKey(idUjian));
        localStorage.removeItem(getCheatKey(idUjian));
        localStorage.removeItem(getCheatLogsKey(idUjian));
      }
      if (appState.autoSyncInterval) {
        clearInterval(appState.autoSyncInterval);
        appState.autoSyncInterval = null;
      }
    }
    
    // ── Sound Check (Uji Coba Headset Sebelum Ujian) ──
    let _testAudioCtx = null;
    let _testOscillator = null;
    let _testGainNode = null;
    let _isTestAudioPlaying = false;
    
    function prepareLaunchExam(idUjian) {
      appState.pendingExamIdForLaunch = idUjian;
      // Jika kebijakan institusi mewajibkan Sound Check (default: ya)
      if (appState.requireSoundCheck !== false) {
        const readyCheck = document.getElementById('checkSoundReady');
        if (readyCheck) readyCheck.checked = false;
        const startBtn = document.getElementById('btnStartConfirmedExam');
        if (startBtn) startBtn.disabled = true;
        openModal('modalSoundCheck');
      } else {
        // Lewati Sound Check sesuai pengaturan sistem institusi
        confirmAndLaunchExam();
      }
    }
    
    function toggleTestAudio() {
      if (_isTestAudioPlaying) {
        stopTestAudio();
      } else {
        startTestAudio();
      }
    }
    
    function startTestAudio() {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!_testAudioCtx) _testAudioCtx = new AudioContext();
        if (_testAudioCtx.state === 'suspended') _testAudioCtx.resume();
        
        _testOscillator = _testAudioCtx.createOscillator();
        _testGainNode = _testAudioCtx.createGain();
        
        const volSlider = document.getElementById('soundTestVolume');
        const vol = volSlider ? parseFloat(volSlider.value) : 0.8;
        _testGainNode.gain.setValueAtTime(vol * 0.15, _testAudioCtx.currentTime);
        
        // Buat nada chime lembut (440Hz / A4 ke 554.37Hz / C#5)
        _testOscillator.type = 'sine';
        _testOscillator.frequency.setValueAtTime(440, _testAudioCtx.currentTime);
        _testOscillator.frequency.exponentialRampToValueAtTime(554.37, _testAudioCtx.currentTime + 0.35);
        _testOscillator.frequency.exponentialRampToValueAtTime(659.25, _testAudioCtx.currentTime + 0.7);
        
        _testOscillator.connect(_testGainNode);
        _testGainNode.connect(_testAudioCtx.destination);
        _testOscillator.start();
        
        _isTestAudioPlaying = true;
        const btn = document.getElementById('btnTestSound');
        const icon = document.getElementById('testSoundIcon');
        const lbl = document.getElementById('testSoundBtnLabel');
        const status = document.getElementById('soundTestStatus');
        if (btn) btn.className = 'btn-cbt btn-cbt-outline';
        if (icon) icon.className = 'bi bi-stop-fill';
        if (lbl) lbl.textContent = 'Hentikan Nada Tes';
        if (status) status.innerHTML = '<span style="color:var(--success);font-weight:600;"><i class="bi bi-soundwave"></i> Nada tes sedang diputar...</span> Atur volume hingga terdengar nyaman.';
        
        _testOscillator.onended = () => stopTestAudio();
      } catch (err) {
        console.warn('Audio Context tidak diizinkan atau tidak didukung:', err);
        showToast('Info Audio', 'Pastikan speaker/headset menyala.', 'info');
      }
    }
    
    function stopTestAudio() {
      if (_testOscillator) {
        try { _testOscillator.stop(); } catch(e){}
        _testOscillator = null;
      }
      _isTestAudioPlaying = false;
      const btn = document.getElementById('btnTestSound');
      const icon = document.getElementById('testSoundIcon');
      const lbl = document.getElementById('testSoundBtnLabel');
      const status = document.getElementById('soundTestStatus');
      if (btn) btn.className = 'btn-cbt btn-cbt-teal';
      if (icon) icon.className = 'bi bi-volume-up-fill';
      if (lbl) lbl.textContent = 'Putar Nada Tes Audio';
      if (status) status.textContent = 'Klik tombol di atas untuk memastikan suara terdengar jelas.';
    }
    
    function setTestAudioVolume(val) {
      if (_testGainNode && _testAudioCtx) {
        _testGainNode.gain.setValueAtTime(parseFloat(val) * 0.15, _testAudioCtx.currentTime);
      }
    }
    
    function closeSoundCheckModal() {
      stopTestAudio();
      closeModal('modalSoundCheck');
      appState.pendingExamIdForLaunch = null;
    }
    
    function confirmAndLaunchExam() {
      stopTestAudio();
      closeModal('modalSoundCheck');
      const idUjian = appState.pendingExamIdForLaunch;
      appState.pendingExamIdForLaunch = null;
      
      // Minta masuk ke Fullscreen Mode jika diwajibkan oleh kebijakan sistem
      if (appState.enforceFullscreen !== false && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('[CBT Security] Fullscreen request rejected:', err);
        });
      }
      
      if (idUjian) {
        beginExam(idUjian);
      }
    }
    
    function beginExam(idUjian) {
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) {
            showToast('Tidak Bisa Melanjutkan', res.message, 'danger');
            clearActiveExamStorage(idUjian);
            navigateTo('examList');
            loadAvailableExams();
            return;
          }
          appState.currentExam = res.data.ujian;
          appState.examQuestions = res.data.soal;
          appState.examStartTimeISO = res.data.waktuMulaiServer;
    
          // Pulihkan jawaban & posisi soal terakhir jika ini adalah resume setelah
          // refresh/tab tertutup, atau mulai bersih jika ini benar-benar sesi baru.
          const savedAnswers = localStorage.getItem(getDraftAnswersKey(idUjian));
          appState.answers = savedAnswers ? JSON.parse(savedAnswers) : {};
          const savedIndex = localStorage.getItem(getQIndexKey(idUjian));
          appState.currentQuestionIndex = savedIndex ? Number(savedIndex) : 0;
          
          // Pulihkan status ragu-ragu, kuota putar audio, dan pelanggaran
          const savedFlagged = localStorage.getItem(getFlaggedKey(idUjian));
          appState.flaggedQuestions = savedFlagged ? JSON.parse(savedFlagged) : {};
          const savedAudio = localStorage.getItem(getAudioKey(idUjian));
          appState.audioPlayCounts = savedAudio ? JSON.parse(savedAudio) : {};
          const savedCheat = localStorage.getItem(getCheatKey(idUjian));
          appState.cheatViolations = savedCheat ? Number(savedCheat) : 0;
          const savedLogs = localStorage.getItem(getCheatLogsKey(idUjian));
          appState.cheatAuditLogs = savedLogs ? JSON.parse(savedLogs) : [];
    
          // Sisa waktu dihitung dari waktu mulai OTORITATIF milik server (bukan
          // direset ke durasi penuh) — refresh halaman tidak akan menambah waktu.
          const durasiMs = Number(res.data.ujian.Durasi_Menit) * 60 * 1000;
          const elapsedMs = Date.now() - new Date(res.data.waktuMulaiServer).getTime();
          appState.timerSecondsLeft = Math.max(0, Math.floor((durasiMs - elapsedMs) / 1000));
    
          // Tandai sesi ujian sedang aktif, supaya bisa dipulihkan otomatis kalau
          // halaman ter-refresh atau tab sempat tertutup.
          localStorage.setItem('cbt_active_exam_id', idUjian);
          localStorage.setItem('cbt_active_exam_data', JSON.stringify({ ID_Ujian: idUjian }));
    
          document.getElementById('examSessionTitle').textContent = res.data.ujian.Nama_Ujian;
          document.getElementById('qNavGrid').innerHTML = appState.examQuestions.map((q, i) =>
            `<div class="q-nav-btn ${appState.flaggedQuestions[q.ID_Soal] ? 'flagged' : ''}" id="qnav-${i}" onclick="jumpToQuestion(${i})">${i + 1}</div>`).join('');
          document.getElementById('totalQCount').textContent = appState.examQuestions.length;
          document.getElementById('qTotalNum').textContent = appState.examQuestions.length;
          
          // Terapkan ukuran font yang dipilih
          applyFontScale(appState.fontScale);
          startAutoSaveHeartbeat(idUjian);
    
          if (res.data.isResumed && Object.keys(appState.answers).length > 0) {
            showToast('Sesi Dipulihkan', 'Progres jawaban ujian Anda sebelumnya berhasil dipulihkan.', 'success');
          }
    
          if (appState.timerSecondsLeft <= 0) {
            showToast('Waktu Habis', 'Waktu ujian telah berakhir. Mengirim jawaban otomatis...', 'warning');
            enableExamProtection();
            doSubmitExam();
            return;
          }
    
          renderQuestion(appState.currentQuestionIndex);
          startTimer();
          enableExamProtection();
          navigateTo('examSession');
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .startExamSession(appState.participant.ID_Peserta, idUjian, (appState.participant && appState.participant.token) || '');
    }
    
    function startTimer() {
      clearInterval(appState.timerInterval);
      appState.timerInterval = setInterval(() => {
        appState.timerSecondsLeft--;
        if (appState.timerSecondsLeft <= 0) {
          clearInterval(appState.timerInterval);
          showToast('Waktu Habis', 'Waktu ujian telah berakhir. Sistem melakukan submit jawaban otomatis...', 'warning');
          doSubmitExam();
          return;
        }
        renderTimer();
      }, 1000);
      renderTimer();
    }
    
    function renderTimer() {
      const h = Math.floor(appState.timerSecondsLeft / 3600);
      const m = Math.floor((appState.timerSecondsLeft % 3600) / 60);
      const s = appState.timerSecondsLeft % 60;
      document.getElementById('timerDisplay').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      document.getElementById('timerCard').classList.toggle('warning', appState.timerSecondsLeft < 300);
    }
    
    // ════════════════════════════════════════════════════════
    // AUTO-SAVE HEARTBEAT & KETAHANAN KONEKSI (RESILIENCE)
    // ════════════════════════════════════════════════════════
    function startAutoSaveHeartbeat(idUjian) {
      if (appState.autoSyncInterval) clearInterval(appState.autoSyncInterval);
      appState.autoSyncInterval = setInterval(() => {
        if (!appState.currentExam || appState.currentExam.ID_Ujian !== idUjian) return;
        try {
          localStorage.setItem(getDraftAnswersKey(idUjian), JSON.stringify(appState.answers));
          localStorage.setItem(getFlaggedKey(idUjian), JSON.stringify(appState.flaggedQuestions));
          localStorage.setItem(getAudioKey(idUjian), JSON.stringify(appState.audioPlayCounts));
          
          const indicator = document.getElementById('autosaveIndicator');
          if (indicator) {
            indicator.innerHTML = `<i class="bi bi-cloud-check-fill" style="color:var(--success);font-size:14px;"></i> <span>Tersimpan (${new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})})</span>`;
          }
        } catch (e) {
          console.warn('[AutoSave] Gagal menyimpan ke localStorage:', e);
        }
      }, 20000); // Sinkronisasi setiap 20 detik
    }

    // ════════════════════════════════════════════════════════
    // AKSESIBILITAS: PENGATUR UKURAN FONT (A- / A / A+)
    // ════════════════════════════════════════════════════════
    function setFontScale(scale) {
      appState.fontScale = scale;
      localStorage.setItem('cbt_font_scale', scale);
      applyFontScale(scale);
    }
    
    function applyFontScale(scale) {
      const area = document.getElementById('examMainArea');
      if (area) {
        area.classList.remove('font-scale-sm', 'font-scale-md', 'font-scale-lg');
        area.classList.add(`font-scale-${scale}`);
      }
      ['btnFontSm', 'btnFontMd', 'btnFontLg'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.classList.remove('active');
      });
      const activeBtnId = scale === 'sm' ? 'btnFontSm' : scale === 'lg' ? 'btnFontLg' : 'btnFontMd';
      const activeBtn = document.getElementById(activeBtnId);
      if (activeBtn) activeBtn.classList.add('active');
    }

    // ════════════════════════════════════════════════════════
    // PROTEKSI INTEGRITAS & ANTI-CURANG (FULLSCREEN & TAB-SWITCH)
    // ════════════════════════════════════════════════════════
    let _examProtectionHandlers = null;
    window._isSubmittingExam = false;
    
    function enableExamProtection() {
      if (_examProtectionHandlers) return; // sudah aktif, jangan pasang dobel
      
      const blockEvent = e => {
        e.preventDefault();
        showToast('Dinonaktifkan', 'Aksi copy/paste/klik kanan dinonaktifkan demi integritas ujian.', 'warning');
      };
      
      const blockShortcuts = e => {
        const key = (e.key || '').toLowerCase();
        const isCtrlCmd = e.ctrlKey || e.metaKey;
        // Blokir shortcut salin, cetak, simpan, inspect, reload
        if ((isCtrlCmd && ['c', 'x', 'u', 's', 'p', 'a', 'v', 'r'].includes(key)) || key === 'f12') {
          e.preventDefault();
          showToast('Dinonaktifkan', 'Pintasan keyboard ini dinonaktifkan selama ujian berlangsung.', 'warning');
        }
      };
      
      // Deteksi keluar dari Fullscreen
      const handleFullscreenChange = () => {
        if (!document.fullscreenElement && !window._isSubmittingExam && appState.currentExam) {
          triggerCheatViolation('Keluar dari Mode Layar Penuh (Fullscreen)');
        }
      };
      
      // Deteksi beralih tab browser atau meminimalkan window
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden' && !window._isSubmittingExam && appState.currentExam) {
          triggerCheatViolation('Pindah Tab Browser atau Meminimalkan Jendela Ujian');
        }
      };
      
      document.addEventListener('copy', blockEvent);
      document.addEventListener('cut', blockEvent);
      document.addEventListener('contextmenu', blockEvent);
      document.addEventListener('keydown', blockShortcuts);
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      _examProtectionHandlers = { blockEvent, blockShortcuts, handleFullscreenChange, handleVisibilityChange };
    }
    
    function disableExamProtection() {
      if (!_examProtectionHandlers) return;
      document.removeEventListener('copy', _examProtectionHandlers.blockEvent);
      document.removeEventListener('cut', _examProtectionHandlers.blockEvent);
      document.removeEventListener('contextmenu', _examProtectionHandlers.blockEvent);
      document.removeEventListener('keydown', _examProtectionHandlers.blockShortcuts);
      document.removeEventListener('fullscreenchange', _examProtectionHandlers.handleFullscreenChange);
      document.removeEventListener('visibilitychange', _examProtectionHandlers.handleVisibilityChange);
      _examProtectionHandlers = null;
    }
    
    function triggerCheatViolation(reason) {
      if (!appState.currentExam || window._isSubmittingExam) return;
      
      // Jika toleransi diatur 0 (Nonaktif), catat di log audit saja tanpa peringatan agresif
      if (appState.maxCheatViolations === 0) {
        appState.cheatAuditLogs.push({ time: new Date().toLocaleTimeString('id-ID'), reason, count: 0 });
        return;
      }
      
      appState.cheatViolations = (appState.cheatViolations || 0) + 1;
      const incident = {
        time: new Date().toLocaleTimeString('id-ID'),
        reason: reason,
        count: appState.cheatViolations
      };
      appState.cheatAuditLogs.push(incident);
      
      if (appState.currentExam) {
        localStorage.setItem(getCheatKey(appState.currentExam.ID_Ujian), appState.cheatViolations);
        localStorage.setItem(getCheatLogsKey(appState.currentExam.ID_Ujian), JSON.stringify(appState.cheatAuditLogs));
      }
      
      const badge = document.getElementById('cheatViolationCountBadge');
      if (badge) badge.textContent = `Pelanggaran ${appState.cheatViolations} dari ${appState.maxCheatViolations}`;
      
      const desc = document.getElementById('cheatWarningDesc');
      if (desc) {
        desc.innerHTML = `Sistem mendeteksi aktivitas mencurigakan: <strong>${reason}</strong> pada pukul ${incident.time}. Aktivitas ini telah dicatat dalam log audit pengawas institusi.`;
      }
      
      if (appState.cheatViolations >= appState.maxCheatViolations) {
        if (appState.cheatAction === 'warn_only') {
          openModal('modalCheatWarning');
        } else {
          forceAutoSubmitCheating();
        }
      } else {
        openModal('modalCheatWarning');
      }
    }
    
    function closeCheatWarningModal() {
      const m = document.getElementById('modalCheatGuard');
      if (m) m.style.display = 'none';
      dismissCheatWarningAndRestoreFullscreen();
    }

    function dismissCheatWarningAndRestoreFullscreen() {
      closeModal('modalCheatWarning');
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    
    function forceAutoSubmitCheating() {
      closeModal('modalCheatWarning');
      window._isSubmittingExam = true;
      showToast('Diskualifikasi Keamanan', 'Batas maksimal toleransi pelanggaran terlampaui. Ujian diselesaikan otomatis oleh sistem.', 'danger');
      doSubmitExam();
    }

    // ════════════════════════════════════════════════════════
    // FITUR RAGU-RAGU (FLAG QUESTION)
    // ════════════════════════════════════════════════════════
    function toggleFlagCurrentQuestion() {
      const q = appState.examQuestions[appState.currentQuestionIndex];
      if (!q) return;
      
      if (appState.flaggedQuestions[q.ID_Soal]) {
        delete appState.flaggedQuestions[q.ID_Soal];
      } else {
        appState.flaggedQuestions[q.ID_Soal] = true;
      }
      
      if (appState.currentExam) {
        localStorage.setItem(getFlaggedKey(appState.currentExam.ID_Ujian), JSON.stringify(appState.flaggedQuestions));
      }
      
      updateFlagButton(q.ID_Soal);
      updateQNavGrid();
    }
    
    function updateFlagButton(idSoal) {
      const btn = document.getElementById('btnFlagCurrentQ');
      const icon = document.getElementById('flagIcon');
      const txt = document.getElementById('flagBtnText');
      if (!btn) return;
      
      const isFlagged = !!appState.flaggedQuestions[idSoal];
      if (isFlagged) {
        btn.style.background = '#F59E0B';
        btn.style.color = '#fff';
        btn.style.borderColor = '#D97706';
        if (icon) icon.className = 'bi bi-flag-fill';
        if (txt) txt.textContent = 'Ditandai Ragu';
      } else {
        btn.style.background = 'var(--warning-bg)';
        btn.style.color = '#B45309';
        btn.style.borderColor = 'var(--accent)';
        if (icon) icon.className = 'bi bi-flag';
        if (txt) txt.textContent = 'Ragu-ragu';
      }
    }

    // ════════════════════════════════════════════════════════
    // AUDIO LISTENING — PLAY COUNT RESTRICTION
    // ════════════════════════════════════════════════════════
    function toggleQuestionAudio(idSoal, audioSrc) {
      const audioEl = document.getElementById(`audio-elem-${idSoal}`);
      const playBtn = document.getElementById(`audio-play-btn-${idSoal}`);
      const icon = document.getElementById(`audio-icon-${idSoal}`);
      const progressBar = document.getElementById(`audio-progress-bar-${idSoal}`);
      const badge = document.getElementById(`audio-badge-${idSoal}`);
      
      if (!audioEl) return;
      
      const currentPlays = appState.audioPlayCounts[idSoal] || 0;
      const maxPlays = appState.audioMaxPlayLimit || 2;
      
      if (audioEl.paused) {
        if (currentPlays >= maxPlays) {
          showToast('Batas Putar Habis', `Audio listening ini telah mencapai batas putar maksimal (${maxPlays} kali) sesuai regulasi ujian.`, 'warning');
          return;
        }
        
        // Putar audio dan tambahkan hitungan
        audioEl.play().then(() => {
          appState.audioPlayCounts[idSoal] = currentPlays + 1;
          if (appState.currentExam) {
            localStorage.setItem(getAudioKey(appState.currentExam.ID_Ujian), JSON.stringify(appState.audioPlayCounts));
          }
          if (icon) icon.className = 'bi bi-pause-fill';
          if (badge) {
            badge.textContent = `Diputar: ${appState.audioPlayCounts[idSoal]} / ${maxPlays} kali`;
            if (appState.audioPlayCounts[idSoal] >= maxPlays) badge.classList.add('depleted');
          }
        }).catch(err => {
          console.warn('Gagal memutar audio:', err);
          showToast('Audio Error', 'Gagal memutar file audio. Periksa izin pemutaran media browser Anda.', 'danger');
        });
      } else {
        audioEl.pause();
        if (icon) icon.className = 'bi bi-play-fill';
      }
    }

    const SESI_ICON = { Listening: 'bi-headphones', 'Grammar-Structure': 'bi-pencil-square', Grammar: 'bi-pencil-square', Structure: 'bi-pencil-square', Reading: 'bi-book' };
    const SESI_LABEL = { Listening: 'Section 1: Listening', 'Grammar-Structure': 'Section 2: Structure', Grammar: 'Section 2: Structure', Structure: 'Section 2: Structure', Reading: 'Section 3: Reading' };
    
    // ── Helper: Sanitasi HTML untuk Cegah XSS ──
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function sanitizeRichText(html) {
      if (!html) return '';
      if (!/<[a-z][\s\S]*>/i.test(html)) {
        return escapeHtml(html).replace(/\n/g, '<br>');
      }
      return String(html)
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
        .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
        .replace(/\son\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
        .replace(/href\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, 'href="#"');
    }

    // Deteksi teks Arab (rentang Unicode Arabic & Arabic Supplement) agar soal
    // berbahasa Arab dapat ditampilkan rata kanan (RTL) supaya mudah dibaca.
    function isArabicText(str) {
      return /[\u0600-\u06FF\u0750-\u077F]/.test(str || '');
    }
    
    function renderQuestion(index) {
      const q = appState.examQuestions[index];
      if (!q) return;
      appState.currentQuestionIndex = index;
      
      // Simpan posisi soal terakhir agar bisa dipulihkan tepat jika halaman di-refresh
      if (appState.currentExam) localStorage.setItem(getQIndexKey(appState.currentExam.ID_Ujian), index);
      document.getElementById('qCurrentNum').textContent = index + 1;
      document.getElementById('currentSectionBadge').innerHTML = `<i class="bi ${SESI_ICON[q.Sesi] || 'bi-file-text'}"></i> ${SESI_LABEL[q.Sesi] || q.Sesi}`;
      
      applyFontScale(appState.fontScale);
      updateFlagButton(q.ID_Soal);
      
      const dynamicWrap = document.getElementById('examQuestionDynamicWrap');
      const hasPassage = !!q.Passage_Teks;
      const passageRtl = isArabicText(q.Passage_Teks);
      const questionRtl = isArabicText(q.Pertanyaan);
      const selected = appState.answers[q.ID_Soal];
      const opts = ['A','B','C','D'];
      
      // Audio Player HTML dengan Batasan Putar
      const playCount = appState.audioPlayCounts[q.ID_Soal] || 0;
      const maxPlays = appState.audioMaxPlayLimit || 2;
      const isDepleted = playCount >= maxPlays;
      
      const audioHtml = q.Link_Audio ? `
        <div class="audio-player-cbt">
          <div class="audio-player-row">
            <button type="button" class="audio-play-btn" id="audio-play-btn-${q.ID_Soal}" ${isDepleted ? 'disabled' : ''} onclick="toggleQuestionAudio('${q.ID_Soal}', '${q.Link_Audio}')">
              <i class="bi ${isDepleted ? 'bi-slash-circle' : 'bi-play-fill'}" id="audio-icon-${q.ID_Soal}"></i>
            </button>
            <audio id="audio-elem-${q.ID_Soal}" src="${q.Link_Audio}" style="display:none;" 
              ontimeupdate="const bar = document.getElementById('audio-progress-bar-${q.ID_Soal}'); if (bar && this.duration) bar.style.width = ((this.currentTime / this.duration) * 100) + '%';"
              onended="const icon = document.getElementById('audio-icon-${q.ID_Soal}'); if (icon) icon.className = 'bi bi-play-fill'; if (${playCount + 1} >= ${maxPlays}) { const btn = document.getElementById('audio-play-btn-${q.ID_Soal}'); if (btn) { btn.disabled = true; icon.className = 'bi bi-slash-circle'; } }">
            </audio>
            <div style="flex:1;">
              <div class="audio-info-title">
                <span>Listening Audio Prompt</span>
                <span class="audio-play-badge ${isDepleted ? 'depleted' : ''}" id="audio-badge-${q.ID_Soal}">
                  ${isDepleted ? `Batas Putar Habis (${maxPlays}/${maxPlays})` : `Diputar: ${playCount} / ${maxPlays} kali`}
                </span>
              </div>
              <div style="font-size:11.5px;opacity:.85;margin-top:2px;">
                ${isDepleted ? 'Audio tidak dapat diputar ulang lagi sesuai regulasi ujian.' : 'Putar rekaman untuk menjawab soal berikut.'}
              </div>
            </div>
          </div>
          <div class="audio-progress-track">
            <div class="audio-progress-bar" id="audio-progress-bar-${q.ID_Soal}"></div>
          </div>
        </div>` : '';
      
      const optionsHtml = opts.map(letter => {
        const text = q['Pilihan_' + letter];
        if (!text) return '';
        const optionRtl = isArabicText(text);
        const safeText = escapeHtml(text);
        return `<div class="option-card ${selected === letter ? 'selected' : ''}" onclick="selectAnswer('${q.ID_Soal}','${letter}')" ${optionRtl ? 'style="flex-direction:row-reverse;"' : ''}>
          <div class="opt-letter">${letter}</div><div ${optionRtl ? 'dir="rtl" style="text-align:right;flex:1;"' : ''}>${safeText}</div>
        </div>`;
      }).join('');
      
      const safePassage = sanitizeRichText(q.Passage_Teks);
      const safePertanyaan = sanitizeRichText(q.Pertanyaan);

      if (hasPassage) {
        // TAMPILAN SPLIT-SCREEN (Teks Bacaan di Kiri, Soal di Kanan)
        dynamicWrap.innerHTML = `
          <div class="exam-split-layout">
            <aside class="passage-split-panel">
              <div class="passage-split-header">
                <span><i class="bi bi-book-half"></i> Reading Passage / Teks Bacaan</span>
                <span style="font-size:11.5px;color:var(--text-muted);font-weight:normal;">Seksi ${q.Sesi}</span>
              </div>
              <div class="passage-split-content" ${passageRtl ? 'dir="rtl" style="text-align:right;"' : ''}>
                ${safePassage}
              </div>
            </aside>
            <div class="card-cbt">
              ${audioHtml}
              <div id="questionText" style="font-weight:600;margin-bottom:16px;" ${questionRtl ? 'dir="rtl" style="text-align:right;"' : ''}>
                ${safePertanyaan}
              </div>
              <div id="optionsWrap">${optionsHtml}</div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding-top:14px;border-top:1px solid var(--border-color);">
                <span style="font-size:12.5px;color:var(--text-muted);"><i class="bi bi-info-circle"></i> Jawaban tersimpan otomatis.</span>
                <button class="btn-cbt btn-cbt-primary" onclick="nextQuestion()">Simpan &amp; Lanjut <i class="bi bi-arrow-right"></i></button>
              </div>
            </div>
          </div>
        `;
      } else {
        // TAMPILAN STANDAR (Single Card)
        dynamicWrap.innerHTML = `
          <div class="card-cbt" id="standardQuestionCard">
            ${audioHtml}
            <div id="questionText" style="font-weight:600;margin-bottom:16px;" ${questionRtl ? 'dir="rtl" style="text-align:right;"' : ''}>
              ${safePertanyaan}
            </div>
            <div id="optionsWrap">${optionsHtml}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding-top:14px;border-top:1px solid var(--border-color);">
              <span style="font-size:12.5px;color:var(--text-muted);"><i class="bi bi-info-circle"></i> Jawaban tersimpan otomatis.</span>
              <button class="btn-cbt btn-cbt-primary" onclick="nextQuestion()">Simpan &amp; Lanjut <i class="bi bi-arrow-right"></i></button>
            </div>
          </div>
        `;
      }
      
      updateQNavGrid();
    }
    
    // Perbaikan bug audio: memilih opsi jawaban TIDAK me-render ulang seluruh DOM,
    // sehingga audio listening yang sedang diputar tidak terpotong seketika!
    function selectAnswer(idSoal, letter) {
      appState.answers[idSoal] = letter;
      
      const optionCards = document.querySelectorAll('#optionsWrap .option-card');
      optionCards.forEach(card => {
        const letterEl = card.querySelector('.opt-letter');
        if (letterEl && letterEl.textContent.trim().toUpperCase() === String(letter).toUpperCase()) {
          card.classList.add('selected');
        } else {
          card.classList.remove('selected');
        }
      });

      if (appState.currentExam) localStorage.setItem(getDraftAnswersKey(appState.currentExam.ID_Ujian), JSON.stringify(appState.answers));
      updateQNavGrid();
    }
    
    function updateQNavGrid() {
      appState.examQuestions.forEach((q, i) => {
        const el = document.getElementById('qnav-' + i);
        if (!el) return;
        el.classList.toggle('answered', !!appState.answers[q.ID_Soal]);
        el.classList.toggle('flagged', !!appState.flaggedQuestions[q.ID_Soal]);
        el.classList.toggle('current', i === appState.currentQuestionIndex);
      });
      document.getElementById('answeredCount').textContent = Object.keys(appState.answers).length;
    }
    
    function nextQuestion() {
      if (appState.currentQuestionIndex < appState.examQuestions.length - 1) renderQuestion(appState.currentQuestionIndex + 1);
      else goToReview();
    }
    function prevQuestion() { if (appState.currentQuestionIndex > 0) renderQuestion(appState.currentQuestionIndex - 1); }
    function jumpToQuestion(i) { renderQuestion(i); navigateTo('examSession'); }
    
    function goToReview() {
      const bySesi = {};
      appState.examQuestions.forEach((q, i) => {
        if (!bySesi[q.Sesi]) bySesi[q.Sesi] = [];
        bySesi[q.Sesi].push({ q, i });
      });
      
      const totalAnswered = Object.keys(appState.answers).length;
      const totalFlagged = Object.keys(appState.flaggedQuestions).filter(k => appState.flaggedQuestions[k]).length;
      const totalQuestions = appState.examQuestions.length;
      const totalUnanswered = totalQuestions - totalAnswered;
      
      const tabsWrap = document.getElementById('reviewTabsWrap');
      tabsWrap.innerHTML = Object.keys(bySesi).map((sesi, idx) => {
        const total = bySesi[sesi].length;
        const answered = bySesi[sesi].filter(x => appState.answers[x.q.ID_Soal]).length;
        return `<div class="tab-pill ${idx === 0 ? 'active' : ''}" onclick="renderReviewGrid('${sesi}', this)">${SESI_LABEL[sesi] || sesi} ${answered}/${total}</div>`;
      }).join('');
      
      // Panel Ringkasan Status Jawaban (Terjawab, Ragu-ragu, Kosong)
      document.getElementById('reviewWarningBox').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:12px;margin-bottom:16px;">
          <div class="card-cbt" style="padding:14px;border-left:4px solid var(--primary);background:var(--bg-card);">
            <div style="font-size:11.5px;color:var(--text-muted);font-weight:600;">TERJAWAB</div>
            <div style="font-size:22px;font-weight:700;color:var(--primary);margin-top:2px;">${totalAnswered} <span style="font-size:13px;color:var(--text-muted);font-weight:normal;">/ ${totalQuestions}</span></div>
          </div>
          <div class="card-cbt" style="padding:14px;border-left:4px solid #F59E0B;background:var(--bg-card);">
            <div style="font-size:11.5px;color:var(--text-muted);font-weight:600;">RAGU-RAGU</div>
            <div style="font-size:22px;font-weight:700;color:#D97706;margin-top:2px;">${totalFlagged} <span style="font-size:13px;color:var(--text-muted);font-weight:normal;">soal</span></div>
          </div>
          <div class="card-cbt" style="padding:14px;border-left:4px solid ${totalUnanswered > 0 ? 'var(--danger)' : 'var(--success)'};background:var(--bg-card);">
            <div style="font-size:11.5px;color:var(--text-muted);font-weight:600;">BELUM DIJAWAB</div>
            <div style="font-size:22px;font-weight:700;color:${totalUnanswered > 0 ? 'var(--danger)' : 'var(--success)'};margin-top:2px;">${totalUnanswered} <span style="font-size:13px;color:var(--text-muted);font-weight:normal;">soal</span></div>
          </div>
        </div>
        ${totalUnanswered > 0 ? `<div style="background:var(--warning-bg);color:var(--warning-text);padding:12px 16px;border-radius:var(--radius-input);margin-bottom:14px;font-size:13px;"><i class="bi bi-exclamation-triangle-fill"></i> Terdapat <strong>${totalUnanswered} soal kosong</strong>. Pastikan Anda memeriksa kembali sebelum menekan submit final.</div>` : ''}
      `;
    
      window._reviewBySesi = bySesi;
      const firstSesi = Object.keys(bySesi)[0];
      renderReviewGrid(firstSesi, null);
      navigateTo('examReview');
    }
    
    function renderReviewGrid(sesi, el) {
      if (el) { document.querySelectorAll('#reviewTabsWrap .tab-pill').forEach(t => t.classList.remove('active')); el.classList.add('active'); }
      const items = window._reviewBySesi[sesi] || [];
      document.getElementById('reviewGridWrap').innerHTML = `<div class="q-nav-grid" style="grid-template-columns:repeat(auto-fill, minmax(60px, 1fr));gap:8px;">` +
        items.map(x => {
          const answered = !!appState.answers[x.q.ID_Soal];
          const isFlagged = !!appState.flaggedQuestions[x.q.ID_Soal];
          let styleBg = 'border:2px solid var(--coral);color:var(--danger);background:transparent;';
          let badgeFlag = '';
          
          if (isFlagged) {
            styleBg = 'background:#F59E0B;border-color:#D97706;color:#1a1305;';
            badgeFlag = '<span style="font-size:9px;display:block;">🚩 Ragu</span>';
          } else if (answered) {
            styleBg = 'background:var(--primary);border-color:var(--primary);color:#fff;';
            badgeFlag = `<span style="font-size:9px;display:block;opacity:.85;">Pilih ${appState.answers[x.q.ID_Soal]}</span>`;
          }
          
          return `
            <div class="q-nav-btn" style="width:auto;height:48px;border-radius:10px;padding:4px;flex-direction:column;font-size:13px;${styleBg}" onclick="jumpToQuestion(${x.i})">
              <span>${x.i + 1}</span>
              ${badgeFlag}
            </div>
          `;
        }).join('') + `</div>`;
    }
    
    function confirmSubmitExam() {
      const totalUnanswered = appState.examQuestions.filter(q => !appState.answers[q.ID_Soal]).length;
      document.getElementById('submitWarningDetail').innerHTML = totalUnanswered > 0
        ? `⚠️ Terdapat <strong>${totalUnanswered} soal</strong> yang belum terisi. Setelah dikonfirmasi, kode akses akan dikunci dan jawaban tidak dapat diubah lagi.`
        : `Seluruh soal telah terjawab. Setelah dikonfirmasi, kode akses akan dikunci dan jawaban tidak dapat diubah lagi.`;
      openModal('modalConfirmSubmitExam');
    }
    
    function doSubmitExam() {
      closeModal('modalConfirmSubmitExam');
      window._isSubmittingExam = true;
      clearInterval(appState.timerInterval);
      showToast('Mengirim...', 'Menyimpan jawaban ujian Anda ke server.', 'success');
      
      // Keluar dari mode layar penuh dengan mulus
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    
      gasRun
        .withSuccessHandler(res => {
          window._isSubmittingExam = false;
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) {
            if (res.data && res.data.disqualified) {
              clearActiveExamStorage(appState.currentExam.ID_Ujian);
              disableExamProtection();
              showToast('Ujian Didiskualifikasi', res.message, 'danger');
              document.getElementById('finalScoreDisplay').innerHTML = `<span style="font-size:24px;color:var(--danger);"><i class="bi bi-x-octagon-fill"></i> 0</span>`;
              document.getElementById('passStatusBadge').innerHTML = `<span class="badge-pill badge-danger"><span class="dot"></span> DIDISKUALIFIKASI (WAKTU HABIS)</span>`;
              document.getElementById('scoreListeningBox').textContent = '0';
              document.getElementById('scoreGrammarBox').textContent = '0';
              document.getElementById('scoreReadingBox').textContent = '0';
              navigateTo('scoreResult');
              return;
            }
            showToast('Gagal', res.message, 'danger');
            return;
          }
          clearActiveExamStorage(appState.currentExam.ID_Ujian);
          disableExamProtection();
          const d = res.data;

          if (appState.releaseScore === 'held') {
            document.getElementById('finalScoreDisplay').innerHTML = `<span style="font-size:24px;color:var(--text-muted);"><i class="bi bi-shield-lock"></i> Hasil Ditahan</span>`;
            document.getElementById('passStatusBadge').innerHTML = `<span class="badge-pill badge-warning"><span class="dot"></span> MENUNGGU VERIFIKASI PENGUJI</span>`;
            document.getElementById('scoreListeningBox').textContent = '-';
            document.getElementById('scoreGrammarBox').textContent = '-';
            document.getElementById('scoreReadingBox').textContent = '-';
          } else {
            document.getElementById('finalScoreDisplay').innerHTML = `${d.skorTotal}<span style="font-size:20px;color:var(--text-muted);"> / ${d.skalaMax}</span>`;
            document.getElementById('passStatusBadge').innerHTML = d.statusLulus === 'Lulus'
              ? `<span class="badge-pill badge-success"><span class="dot"></span> PASSED (LULUS)</span>`
              : `<span class="badge-pill badge-danger"><span class="dot"></span> TIDAK LULUS</span>`;
            
            if (appState.showSectionBreakdown === false) {
              document.getElementById('scoreListeningBox').textContent = 'Dirahasiakan';
              document.getElementById('scoreGrammarBox').textContent = 'Dirahasiakan';
              document.getElementById('scoreReadingBox').textContent = 'Dirahasiakan';
            } else {
              const lScaled = d.scaledListening !== undefined ? ` (Skor: ${d.scaledListening})` : '';
              const gScaled = d.scaledGrammar !== undefined ? ` (Skor: ${d.scaledGrammar})` : '';
              const rScaled = d.scaledReading !== undefined ? ` (Skor: ${d.scaledReading})` : '';
              document.getElementById('scoreListeningBox').textContent = `${d.skorListening}/${d.maxListening}${lScaled}`;
              document.getElementById('scoreGrammarBox').textContent = `${d.skorGrammar}/${d.maxGrammar}${gScaled}`;
              document.getElementById('scoreReadingBox').textContent = `${d.skorReading}/${d.maxReading}${rScaled}`;
            }
          }
          navigateTo('scoreResult');
        })
        .withFailureHandler(err => {
          window._isSubmittingExam = false;
          showToast('Error', err.message, 'danger');
        })
        .submitExamAnswers(appState.participant.ID_Peserta, appState.participant.Nama, appState.currentExam.ID_Ujian, appState.answers, appState.examStartTimeISO);
    }
    
    // ════════════════════════════════════════════════════════
    // DOSEN — DASHBOARD (juga dipakai Admin untuk "Ujian Saya")
    // ════════════════════════════════════════════════════════
    
    // Admin memiliki ID pemilik virtual 'ADMIN' agar bisa membuat & mengelola ujian
    // sendiri layaknya Dosen, tanpa perlu menugaskan ke dosen manapun.
    function getExamOwnerId() {
      return appState.staff.role === 'admin' ? 'ADMIN' : appState.staff.ID_Dosen;
    }
    
    function loadDosenDashboard() {
      // Sesuaikan judul & tombol header agar kontekstual untuk Admin vs Dosen
      const headerTitle = document.querySelector('#section-dosenDashboard .page-header h2');
      const headerDesc = document.querySelector('#section-dosenDashboard .page-header p');
      if (appState.staff.role === 'admin') {
        headerTitle.textContent = 'Ujian Saya (Dikelola Admin)';
        headerDesc.textContent = 'Ujian yang Anda buat & kelola langsung sebagai Administrator, terpisah dari ujian milik dosen.';
      } else {
        headerTitle.textContent = 'My Exams (Ujian Saya)';
        headerDesc.textContent = 'Kelola paket ujian kebahasaan yang Anda buat.';
      }
    
      gasRun
        .withSuccessHandler(res => {
          if (!res) {
            showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger');
            document.getElementById('dosenExamTableBody').innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);"><i class="bi bi-wifi-off" style="color:var(--danger);"></i>Tidak ada respons dari server.<br><span style="font-size:12px;">Pastikan server backend Vercel aktif dan database PostgreSQL telah terhubung.</span><br><button class="btn-cbt btn-cbt-outline" style="margin-top:10px;" onclick="loadDosenDashboard()"><i class="bi bi-arrow-clockwise"></i> Coba Lagi</button></div></td></tr>`;
            return;
          }
          if (!res.success) {
            showToast('Gagal Memuat', res.message, 'danger');
            document.getElementById('dosenExamTableBody').innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);"><i class="bi bi-exclamation-triangle" style="color:var(--danger);"></i>Gagal memuat data ujian dari server:<br><code style="font-size:11.5px;">${res.message}</code></div></td></tr>`;
            return;
          }
          try {
            const exams = res.data;
            const totalUjian = exams.length;
            const aktif = exams.filter(e => e.Status === 'Aktif').length;
            const selesai = exams.reduce((s, e) => s + Number(e.pesertaSelesai || 0), 0);
    
            document.getElementById('dosenStatCards').innerHTML = statCard('bi-journal-text', 'icon-bg-teal', totalUjian, 'Total Ujian Dibuat') +
              statCard('bi-broadcast', 'icon-bg-amber', aktif, 'Ujian Aktif (Open)') +
              statCard('bi-people', 'icon-bg-indigo', selesai, 'Peserta Selesai') +
              statCard('bi-award', 'icon-bg-coral', '-', 'Rata-rata Skor');
    
            document.getElementById('dosenExamTableBody').innerHTML = exams.length ? exams.map(u => `
              <tr>
                <td><strong>${u.Nama_Ujian || '(Tanpa Nama)'}</strong><div style="font-size:11.5px;color:var(--text-muted);">ID: ${u.ID_Ujian}</div></td>
                <td>${u.jumlahSesi || 0} Sesi · ${u.jumlahSoal || 0} Soal</td>
                <td>${statusBadge(u.Status)}</td>
                <td>${u.pesertaSelesai || 0}</td>
                <td>${formatDate(u.Tanggal_Buka)}</td>
                <td>
                  <button class="btn-icon-sm" title="Lihat Hasil" onclick="openExamResults('${u.ID_Ujian}','${(u.Nama_Ujian||'').replace(/'/g,"")}')"><i class="bi bi-eye"></i></button>
                  <button class="btn-icon-sm" title="Upload Soal" onclick="openUploadCsv('${u.ID_Ujian}','${(u.Nama_Ujian||'').replace(/'/g,"")}')"><i class="bi bi-cloud-upload"></i></button>
                  <button class="btn-icon-sm" title="Kelola Soal" onclick="openManageQuestions('${u.ID_Ujian}','${(u.Nama_Ujian||'').replace(/'/g,"")}')"><i class="bi bi-list-ul"></i></button>
                  <button class="btn-icon-sm" title="Edit" onclick="editExam('${u.ID_Ujian}')"><i class="bi bi-pencil"></i></button>
                </td>
              </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-journal-plus"></i>Belum ada ujian. Buat ujian pertama Anda.</div></td></tr>`;
    
            window._dosenExamsCache = exams;
          } catch (renderErr) {
            showToast('Error Tampilan', 'Gagal menampilkan daftar ujian: ' + renderErr.message, 'danger');
            document.getElementById('dosenExamTableBody').innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);"><i class="bi bi-exclamation-triangle" style="color:var(--danger);"></i>Gagal menampilkan daftar ujian:<br><code style="font-size:11.5px;">${renderErr.message}</code></div></td></tr>`;
          }
        })
        .withFailureHandler(err => {
          showToast('Error', err.message, 'danger');
          document.getElementById('dosenExamTableBody').innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);"><i class="bi bi-exclamation-triangle" style="color:var(--danger);"></i>Gagal terhubung ke server:<br><code style="font-size:11.5px;">${err.message}</code></div></td></tr>`;
        })
        .getExamsByLecturer(getExamOwnerId());
    }
    
    function statCard(icon, iconClass, value, label, subtext = '') {
      const subHtml = subtext ? `<div class="stat-sub">${subtext}</div>` : '';
      return `
        <div class="stat-card">
          <div class="stat-icon ${iconClass}"><i class="bi ${icon}"></i></div>
          <div class="stat-value">${value}</div>
          <div class="stat-label">${label}</div>
          ${subHtml}
        </div>`;
    }
    function statusBadge(status) {
      const map = { Aktif: 'badge-success', Draft: 'badge-neutral', Diarsipkan: 'badge-neutral', Archived: 'badge-neutral' };
      return `<span class="badge-pill ${map[status] || 'badge-neutral'}"><span class="dot"></span>${status}</span>`;
    }
    function formatDate(iso) {
      if (!iso) return '-';
      try { const d = new Date(iso); return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) + ' ' + d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}); } catch(e) { return iso; }
    }
    
    function openCreateExamForm() { appState.editingExamId = null; navigateTo('createExam'); }
    function prepareCreateExamForm() {
      document.getElementById('createExamTitle').textContent = appState.editingExamId ? 'Edit Ujian' : 'Buat Ujian Baru';
      if (!appState.editingExamId) document.getElementById('formCreateExam').reset();
    
      // Dropdown "Dosen Pengampu" hanya relevan & ditampilkan untuk Admin,
      // karena Dosen hanya membuat ujian untuk dirinya sendiri.
      const wrap = document.getElementById('dosenAssignWrap');
      if (appState.staff.role === 'admin') {
        wrap.style.display = '';
        gasRun.withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) return;
          const select = document.getElementById('examDosenAssign');
          const currentVal = appState.editingExamId ? select.value : 'ADMIN';
          select.innerHTML = '<option value="ADMIN">Dikelola Langsung oleh Admin (Saya Sendiri)</option>' +
            res.data.filter(d => d.Status === 'Aktif').map(d => `<option value="${d.ID_Dosen}">${d.Nama}</option>`).join('');
          if (appState.editingExamId) select.value = window._editingExamDosenValue || 'ADMIN';
        }).getAllLecturers();
      } else {
        wrap.style.display = 'none';
      }
    }
    
    function editExam(idUjian) {
      const exam = (window._dosenExamsCache || []).find(e => e.ID_Ujian === idUjian) ||
                   (window._allExamsCache || []).find(e => e.ID_Ujian === idUjian);
      if (!exam) return;
      appState.editingExamId = idUjian;
      window._editingExamDosenValue = exam.ID_Dosen_Pembuat || 'ADMIN';
      document.getElementById('examIdEdit').value = idUjian;
      document.getElementById('examNama').value = exam.Nama_Ujian;
      document.getElementById('examDeskripsi').value = exam.Deskripsi || '';
      document.getElementById('examDurasi').value = exam.Durasi_Menit;
      document.getElementById('examPassing').value = exam.Passing_Score;
      document.getElementById('examBuka').value = toDatetimeLocal(exam.Tanggal_Buka);
      document.getElementById('examTutup').value = toDatetimeLocal(exam.Tanggal_Tutup);
      navigateTo('createExam');
    }
    function toDatetimeLocal(iso) { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
    
    function handleCreateExam(e) { e.preventDefault(); saveExam('Aktif'); }
    
    function saveExam(statusValue) {
      // Admin bisa menugaskan dosen pengampu via dropdown, atau mengelola ujian
      // sendiri (nilai 'ADMIN') jika dropdown tidak ditampilkan/dosen tidak dipilih.
      const dosenOwner = appState.staff.role === 'admin'
        ? document.getElementById('examDosenAssign').value
        : getExamOwnerId();
    
      const examObj = {
        ID_Ujian: appState.editingExamId || undefined,
        Nama_Ujian: document.getElementById('examNama').value.trim(),
        Deskripsi: document.getElementById('examDeskripsi').value.trim(),
        ID_Dosen_Pembuat: dosenOwner,
        Durasi_Menit: Number(document.getElementById('examDurasi').value),
        Passing_Score: Number(document.getElementById('examPassing').value),
        Tanggal_Buka: document.getElementById('examBuka').value,
        Tanggal_Tutup: document.getElementById('examTutup').value,
        Status: statusValue,
        Acak_Jawaban: true,
        Kunci_Setelah_Submit: true
      };
      if (!examObj.Nama_Ujian || !examObj.Tanggal_Buka || !examObj.Tanggal_Tutup) { showToast('Peringatan', 'Lengkapi field wajib.', 'warning'); return; }
    
      const fn = appState.editingExamId ? 'updateExam' : 'createExam';
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
          showToast('Berhasil', res.message, 'success');
          if (!appState.editingExamId) openUploadCsv(res.data.ID_Ujian, res.data.Nama_Ujian);
          else navigateTo('dosenDashboard');
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        [fn](examObj);
    }
    
    // ════════════════════════════════════════════════════════
    // DOSEN — UPLOAD CSV
    // ════════════════════════════════════════════════════════
    function openUploadCsv(idUjian, namaUjian) {
      window._currentUploadExamId = idUjian;
      document.getElementById('uploadCsvExamName').textContent = namaUjian;
      document.getElementById('csvValidationResult').innerHTML = '';
      document.getElementById('csvFileName').textContent = '';
      navigateTo('uploadCSV');
    }
    
    function downloadCsvTemplate() {
      const headers = 'Sesi,Pertanyaan,Passage_Teks,Link_Audio,Pilihan_A,Pilihan_B,Pilihan_C,Pilihan_D,Jawaban_Benar,Poin';
      const example = 'Listening,"What does the man imply?","","https://example.com/audio/sample1.mp3","Option A","Option B","Option C","Option D",B,1';
      const csv = headers + '\n' + example;
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'template_soal_cbt.csv';
      link.click();
    }
    
    let selectedCsvFile = null;
    function handleCsvSelected(e) {
      selectedCsvFile = e.target.files[0];
      if (selectedCsvFile) document.getElementById('csvFileName').textContent = '📄 ' + selectedCsvFile.name;
    }
    
    function validateAndPreviewCsv() {
      if (!selectedCsvFile) { showToast('Peringatan', 'Pilih file CSV terlebih dahulu.', 'warning'); return; }
      Papa.parse(selectedCsvFile, {
        header: true, skipEmptyLines: true, encoding: 'UTF-8',
        complete: function(results) {
          appState.csvParsedQuestions = results.data;
          const errors = [];
          results.data.forEach((row, i) => {
            if (!row.Sesi || !row.Pertanyaan || !row.Jawaban_Benar) errors.push({ row: i + 1, msg: 'Kolom wajib kosong.' });
            else if (!['A','B','C','D'].includes(String(row.Jawaban_Benar).toUpperCase())) errors.push({ row: i + 1, msg: 'Jawaban_Benar harus A/B/C/D.' });
          });
          const validCount = results.data.length - errors.length;
          document.getElementById('csvValidationResult').innerHTML = `
            <div class="card-cbt">
              <div style="display:flex;gap:12px;margin-bottom:14px;">
                <span class="badge-pill badge-success"><span class="dot"></span>${validCount} Baris Valid</span>
                ${errors.length ? `<span class="badge-pill badge-danger"><span class="dot"></span>${errors.length} Baris Bermasalah</span>` : ''}
              </div>
              <div class="table-wrap"><table class="table-cbt">
                <thead><tr><th>Baris</th><th>Sesi</th><th>Cuplikan Pertanyaan</th><th>Status</th></tr></thead>
                <tbody>${results.data.slice(0,10).map((row,i) => {
                  const err = errors.find(e => e.row === i+1);
                  return `<tr><td>#${i+1}</td><td>${row.Sesi||'-'}</td><td>${(row.Pertanyaan||'').substring(0,60)}...</td>
                    <td>${err ? `<span class="badge-pill badge-danger"><span class="dot"></span>Error</span><div style="font-size:11px;color:var(--danger);">${err.msg}</div>` : `<span class="badge-pill badge-success"><span class="dot"></span>Valid</span>`}</td></tr>`;
                }).join('')}</tbody>
              </table></div>
              <div style="text-align:right;margin-top:14px;">
                <button class="btn-cbt btn-cbt-primary" ${errors.length ? 'disabled' : ''} onclick="confirmImportCsv()"><i class="bi bi-upload"></i> Konfirmasi Impor Soal (${validCount} Butir)</button>
              </div>
            </div>`;
        }
      });
    }
    
    function confirmImportCsv() {
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
          showToast('Berhasil', `${res.data.success} soal berhasil diimpor.`, 'success');
          navigateTo('dosenDashboard');
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .importQuestionsBatch(window._currentUploadExamId, appState.csvParsedQuestions);
    }
    
    // ════════════════════════════════════════════════════════
    // UPLOAD AUDIO KE CLOUD STORAGE (Vercel Blob / Storage)
    // ════════════════════════════════════════════════════════
    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    
    // Dipakai di halaman Upload CSV — hasil link ditampilkan untuk disalin manual ke kolom Link_Audio
    function handleAudioFileSelected(event) {
      const file = event.target.files[0];
      if (!file) return;
      const box = document.getElementById('audioUploadResult');
      box.innerHTML = `<div class="skeleton" style="height:44px;"></div>`;
    
      fileToBase64(file).then(base64 => {
        gasRun
          .withSuccessHandler(res => {
            if (!res) { box.innerHTML = ''; showToast('Koneksi Terputus', 'Tidak ada respons dari server saat upload audio.', 'danger'); return; }
            if (!res.success) { box.innerHTML = ''; showToast('Gagal', res.message, 'danger'); return; }
            box.innerHTML = `
              <div style="background:var(--success-bg);color:var(--success-text);border-radius:var(--radius-input);padding:12px;font-size:12.5px;">
                <i class="bi bi-check-circle-fill"></i> Audio berhasil diupload! Salin link berikut ke kolom <code>Link_Audio</code> pada baris CSV yang sesuai:
              </div>
              <div style="display:flex;gap:8px;margin-top:8px;">
                <input type="text" class="input-cbt" value="${res.data.fileUrl}" readonly id="lastAudioUrlField">
                <button type="button" class="btn-cbt btn-cbt-outline" onclick="copyCredentialField('lastAudioUrlField', this)"><i class="bi bi-clipboard"></i></button>
              </div>`;
            showToast('Berhasil', 'File audio berhasil diunggah ke penyimpanan cloud.', 'success');
          })
          .withFailureHandler(err => { box.innerHTML = ''; showToast('Error', err.message, 'danger'); })
          .uploadAudioToDrive(base64, file.name, file.type || 'audio/mpeg');
      }).catch(() => showToast('Error', 'Gagal membaca file audio.', 'danger'));
    }
    
    // Dipakai di dalam modal Edit/Tambah Soal — otomatis mengisi field Link_Audio setelah upload selesai
    function handleQfAudioSelected(event) {
      const file = event.target.files[0];
      if (!file) return;
      const statusEl = document.getElementById('qfAudioUploadStatus');
      statusEl.textContent = 'Mengupload audio...';
    
      fileToBase64(file).then(base64 => {
        gasRun
          .withSuccessHandler(res => {
            if (!res) { statusEl.textContent = ''; showToast('Koneksi Terputus', 'Tidak ada respons dari server saat upload audio.', 'danger'); return; }
            if (!res.success) { statusEl.textContent = ''; showToast('Gagal', res.message, 'danger'); return; }
            document.getElementById('qfLinkAudio').value = res.data.fileUrl;
            statusEl.textContent = '✅ Audio berhasil diupload & link terisi otomatis.';
            showToast('Berhasil', 'Audio berhasil diupload.', 'success');
          })
          .withFailureHandler(err => { statusEl.textContent = ''; showToast('Error', err.message, 'danger'); })
          .uploadAudioToDrive(base64, file.name, file.type || 'audio/mpeg');
      }).catch(() => showToast('Error', 'Gagal membaca file audio.', 'danger'));
    }
    
    // ════════════════════════════════════════════════════════
    // KELOLA SOAL — EDIT / TAMBAH / HAPUS SOAL INDIVIDUAL
    // ════════════════════════════════════════════════════════
    function openManageQuestions(idUjian, namaUjian) {
      if (!idUjian) { showToast('Peringatan', 'Pilih ujian terlebih dahulu.', 'warning'); return; }
      window._manageQuestionsExamId = idUjian;
      document.getElementById('manageQuestionsExamName').textContent = namaUjian || idUjian;
      navigateTo('manageQuestions');
      loadManageQuestionsTable(idUjian);
    }
    
    function loadManageQuestionsTable(idUjian) {
      const tbody = document.getElementById('manageQuestionsTableBody');
      tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:40px;"></div></td></tr>`;
      gasRun
        .withSuccessHandler(res => {
          if (!res) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);">Tidak ada respons dari server.</div></td></tr>`; return; }
          if (!res.success) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);">${res.message}</div></td></tr>`; return; }
          const soal = res.data.sort((a, b) => Number(a.Nomor) - Number(b.Nomor));
          window._manageQuestionsCache = soal;
          tbody.innerHTML = soal.length ? soal.map(s => `
            <tr>
              <td>${s.Nomor}</td>
              <td><span class="badge-pill badge-indigo">${s.Sesi}</span></td>
              <td style="max-width:360px;">${(s.Pertanyaan || '').substring(0, 90)}${(s.Pertanyaan || '').length > 90 ? '...' : ''}</td>
              <td><strong>${s.Jawaban_Benar}</strong></td>
              <td>${s.Poin}</td>
              <td>
                <button class="btn-icon-sm" title="Edit" onclick="openQuestionFormModal('${s.ID_Soal}')"><i class="bi bi-pencil"></i></button>
                <button class="btn-icon-sm" title="Hapus" onclick="deleteQuestionRow('${s.ID_Soal}')"><i class="bi bi-trash" style="color:var(--danger);"></i></button>
              </td>
            </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-file-earmark-x"></i>Belum ada soal untuk ujian ini. Upload CSV atau tambah manual.</div></td></tr>`;
        })
        .withFailureHandler(err => { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);">${err.message}</div></td></tr>`; })
        .getQuestionsByExam(idUjian);
    }
    
    function toggleAudioFieldVisibility() {
      const sesi = document.getElementById('qfSesi').value;
      document.getElementById('qfAudioWrap').style.display = sesi === 'Listening' ? '' : 'none';
    }
    
    function openQuestionFormModal(idSoal) {
      document.getElementById('qfAudioUploadStatus').textContent = '';
      if (idSoal) {
        const soal = (window._manageQuestionsCache || []).find(s => s.ID_Soal === idSoal);
        if (!soal) return;
        document.getElementById('questionFormTitle').innerHTML = '<i class="bi bi-pencil-square"></i> Edit Soal';
        document.getElementById('qfSoalId').value = soal.ID_Soal;
        document.getElementById('qfSesi').value = ['Listening','Structure','Reading'].includes(soal.Sesi) ? soal.Sesi : 'Listening';
        document.getElementById('qfPoin').value = soal.Poin || 1;
        document.getElementById('qfPertanyaan').value = soal.Pertanyaan || '';
        document.getElementById('qfPassage').value = soal.Passage_Teks || '';
        document.getElementById('qfLinkAudio').value = soal.Link_Audio || '';
        document.getElementById('qfPilihanA').value = soal.Pilihan_A || '';
        document.getElementById('qfPilihanB').value = soal.Pilihan_B || '';
        document.getElementById('qfPilihanC').value = soal.Pilihan_C || '';
        document.getElementById('qfPilihanD').value = soal.Pilihan_D || '';
        document.getElementById('qfJawabanBenar').value = soal.Jawaban_Benar || 'A';
      } else {
        document.getElementById('questionFormTitle').innerHTML = '<i class="bi bi-plus-circle"></i> Tambah Soal Manual';
        document.getElementById('qfSoalId').value = '';
        document.getElementById('qfSesi').value = 'Listening';
        document.getElementById('qfPoin').value = 1;
        ['qfPertanyaan','qfPassage','qfLinkAudio','qfPilihanA','qfPilihanB','qfPilihanC','qfPilihanD'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('qfJawabanBenar').value = 'A';
      }
      toggleAudioFieldVisibility();
      openModal('modalQuestionForm');
    }
    
    function submitQuestionForm() {
      const idSoal = document.getElementById('qfSoalId').value;
      const soalObj = {
        ID_Soal: idSoal || undefined,
        ID_Ujian: window._manageQuestionsExamId,
        Sesi: document.getElementById('qfSesi').value,
        Pertanyaan: document.getElementById('qfPertanyaan').value.trim(),
        Passage_Teks: document.getElementById('qfPassage').value.trim(),
        Link_Audio: document.getElementById('qfLinkAudio').value.trim(),
        Pilihan_A: document.getElementById('qfPilihanA').value.trim(),
        Pilihan_B: document.getElementById('qfPilihanB').value.trim(),
        Pilihan_C: document.getElementById('qfPilihanC').value.trim(),
        Pilihan_D: document.getElementById('qfPilihanD').value.trim(),
        Jawaban_Benar: document.getElementById('qfJawabanBenar').value,
        Poin: Number(document.getElementById('qfPoin').value) || 1
      };
      if (!soalObj.Pertanyaan || !soalObj.Pilihan_A || !soalObj.Pilihan_B) {
        showToast('Peringatan', 'Pertanyaan, Pilihan A, dan Pilihan B wajib diisi.', 'warning');
        return;
      }
    
      if (idSoal) {
        gasRun.withSuccessHandler(handleQuestionSaved).withFailureHandler(err => showToast('Error', err.message, 'danger')).updateQuestion(soalObj);
      } else {
        gasRun.withSuccessHandler(handleQuestionSaved).withFailureHandler(err => showToast('Error', err.message, 'danger')).addSingleQuestion(window._manageQuestionsExamId, soalObj);
      }
    }
    
    function handleQuestionSaved(res) {
      if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
      if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
      showToast('Berhasil', res.message, 'success');
      closeModal('modalQuestionForm');
      loadManageQuestionsTable(window._manageQuestionsExamId);
    }
    
    function deleteQuestionRow(idSoal) {
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
          showToast(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'danger');
          loadManageQuestionsTable(window._manageQuestionsExamId);
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .deleteQuestion(idSoal);
    }
    
    // ════════════════════════════════════════════════════════
    // DOSEN — HASIL UJIAN
    // ════════════════════════════════════════════════════════
    function openExamResults(idUjian, namaUjian) {
      window._currentResultsExamId = idUjian;
      document.getElementById('resultsExamNameLabel').textContent = namaUjian;
      navigateTo('examResultsDosen');
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) return;
          const hasil = res.data;
          const total = hasil.length;
          const lulus = hasil.filter(h => h.Status_Lulus === 'Lulus').length;
          const avg = total ? Math.round(hasil.reduce((s,h) => s + Number(h.Skor_Total), 0) / total) : 0;
          const tinggi = total ? Math.max(...hasil.map(h => Number(h.Skor_Total))) : 0;
    
          document.getElementById('dosenResultStatCards').innerHTML =
            statCard('bi-people','icon-bg-teal', total, 'Total Peserta') +
            statCard('bi-graph-up','icon-bg-amber', avg, 'Rata-rata Skor') +
            statCard('bi-percent','icon-bg-indigo', total ? Math.round(lulus/total*100)+'%' : '0%', 'Tingkat Kelulusan') +
            statCard('bi-trophy','icon-bg-coral', tinggi, 'Skor Tertinggi');
    
          document.getElementById('dosenResultsTableBody').innerHTML = hasil.length ? hasil.map(h => `
            <tr><td>${h.Nama_Peserta}</td><td>${h.Skor_Listening}</td><td>${h.Skor_Grammar}</td><td>${h.Skor_Reading}</td>
            <td><strong>${h.Skor_Total}</strong></td><td>${h.Status_Lulus === 'Lulus' ? '<span class="badge-pill badge-success"><span class="dot"></span>LULUS</span>' : '<span class="badge-pill badge-danger"><span class="dot"></span>TIDAK LULUS</span>'}</td></tr>
          `).join('') : `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-clipboard-x"></i>Belum ada peserta yang menyelesaikan ujian ini.</div></td></tr>`;
    
          window._currentResultsCache = hasil;
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getExamResultsForLecturer(idUjian);
    }
    
    function downloadResultsExcel() {
      const data = window._currentResultsCache || window._globalReportCache || [];
      if (!data.length) { showToast('Info', 'Tidak ada data untuk diunduh.', 'warning'); return; }
      const headers = Object.keys(data[0]);
      const headerLine = headers.join(',');

      // Sanitasi nilai sel untuk cegah CSV Formula Injection (=, +, -, @)
      const sanitizeCell = val => {
        if (val === null || val === undefined) return '""';
        let s = String(val).replace(/"/g, '""');
        if (/^[=\+\-@]/.test(s)) s = "'" + s;
        return `"${s}"`;
      };

      const rows = data.map(r => headers.map(h => sanitizeCell(r[h])).join(',')).join('\r\n');
      // Sisipkan UTF-8 BOM (\uFEFF) agar Microsoft Excel di Windows membuka karakter Unicode & kolom dengan rapi
      const blob = new Blob(['\uFEFF' + headerLine + '\r\n' + rows], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `rekap_hasil_ujian_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
    }
    
    // ════════════════════════════════════════════════════════
    // ADMIN — DASHBOARD
    // ════════════════════════════════════════════════════════
    function loadAdminDashboard() {
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) { showToast('Error', res.message, 'danger'); return; }
          const d = res.data;
          
          // 4 Kartu KPI Utama dengan sub-info
          const totalSelesai = Number(d.totalHasilSelesai) || 0;
          const totalLulus = Number(d.lulus) || 0;
          const totalPeserta = Number(d.totalPeserta) || 0;
          const ujianAktif = Number(d.ujianAktif) || 0;
          const rataRata = d.rataRata || 0;
          const tingkatKelulusan = d.tingkatKelulusan !== undefined ? d.tingkatKelulusan : '0.0';

          document.getElementById('adminStatCards').innerHTML =
            statCard('bi-people-fill', 'icon-bg-teal', totalPeserta, 'Total Peserta Terdaftar', '<i class="bi bi-person-check"></i> Terdaftar di sistem') +
            statCard('bi-clipboard2-check', 'icon-bg-amber', ujianAktif, 'Ujian Aktif Berjalan', '<i class="bi bi-broadcast"></i> Sesi siap diakses') +
            statCard('bi-bar-chart-line', 'icon-bg-indigo', rataRata, 'Rata-rata Skor Institusi', '<i class="bi bi-award"></i> Skala TOEFL 310–677') +
            statCard('bi-percent', 'icon-bg-coral', tingkatKelulusan + '%', 'Tingkat Kelulusan', `<i class="bi bi-check-circle"></i> ${totalLulus} dari ${totalSelesai} siswa lulus`);

          // Update badge total selesai di header analitik
          const badgeHasil = document.getElementById('dashboardTotalHasilBadge');
          if (badgeHasil) {
            badgeHasil.innerHTML = `<i class="bi bi-mortarboard"></i> ${totalSelesai} Peserta Selesai`;
          }

          // Render Metrik Live Status Database & Kuota Free Tier (Vercel / Neon)
          if (d.dbUsage) {
            const usedEl = document.getElementById('dbUsedStorage');
            const percentEl = document.getElementById('dbPercentUsed');
            const fillEl = document.getElementById('dbQuotaMeterFill');
            const statusEl = document.getElementById('dbStatusBadge');
            const tablesEl = document.getElementById('dbTableStatsMini');

            if (usedEl) usedEl.textContent = `${d.dbUsage.usedMB || '0.00'} MB`;
            if (percentEl) percentEl.textContent = `${d.dbUsage.percentUsed || 0}%`;
            if (fillEl) {
              const p = Math.min(100, Math.max(0.2, Number(d.dbUsage.percentUsed) || 0));
              fillEl.style.width = p + '%';
              fillEl.className = 'quota-meter-fill' + (p > 90 ? ' danger' : p > 70 ? ' warning' : '');
            }
            if (statusEl) {
              const isWarning = (d.dbUsage.percentUsed > 70);
              const isDanger = (d.dbUsage.percentUsed > 90);
              statusEl.className = 'badge-pill ' + (isDanger ? 'badge-danger' : isWarning ? 'badge-amber' : 'badge-success');
              statusEl.innerHTML = `<span class="dot"></span>${d.dbUsage.statusText || 'Optimal (<70%)'}`;
            }
            if (tablesEl && Array.isArray(d.dbUsage.tableStats) && d.dbUsage.tableStats.length) {
              tablesEl.innerHTML = d.dbUsage.tableStats.map(t => `
                <div style="font-size:11.5px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border-color);padding:3px 0;">
                  <code>${t.name}</code>
                  <span style="color:var(--text-muted);font-weight:600;">${t.rows} baris (${t.sizeKB} KB)</span>
                </div>
              `).join('');
            }
          }

          renderDistribusiChart(d.distribusi);
          renderKelulusanDonutChart(d.lulus, d.tidakLulus, tingkatKelulusan);
          renderDashboardRecentLogs(d.recentLogs);
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getAdminDashboardData();
    }

    function renderDistribusiChart(distribusi) {
      const ctx = document.getElementById('chartDistribusi');
      if (!ctx) return;
      if (appState.chartInstances.distribusi) {
        appState.chartInstances.distribusi.destroy();
      }

      const defaultBuckets = ['<420', '420-460', '461-500', '501-550', '551-600', '>600'];
      const labels = (distribusi && distribusi.length) ? distribusi.map(d => d.label) : defaultBuckets;
      const values = (distribusi && distribusi.length) ? distribusi.map(d => Number(d.count) || 0) : [0, 0, 0, 0, 0, 0];
      const totalParticipants = values.reduce((a, b) => a + b, 0);

      // Warna bertingkat CEFR: Merah (Elem), Kuning (Low-Int), Gold (Int), Teal (High-Int), Biru (Adv), Violet (Prof)
      const colors = ['#F43F5E', '#F59E0B', '#EAB308', '#0D9488', '#2563EB', '#7C3AED'];

      appState.chartInstances.distribusi = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Jumlah Peserta',
            data: values,
            backgroundColor: colors,
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 28
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              titleFont: { family: 'Poppins', size: 12, weight: '600' },
              bodyFont: { family: 'Inter', size: 11.5 },
              padding: 9,
              cornerRadius: 7,
              callbacks: {
                title: items => 'Rentang Skor: ' + items[0].label,
                label: context => {
                  const val = context.raw || 0;
                  const pct = totalParticipants > 0 ? ((val / totalParticipants) * 100).toFixed(1) : 0;
                  return '  ' + val + ' Peserta (' + pct + '%)';
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: '#334155',
                font: { family: 'Inter', size: 10.5, weight: '600' }
              }
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(226, 232, 240, 0.7)' },
              ticks: {
                stepSize: 1,
                precision: 0,
                color: '#64748B',
                font: { family: 'Inter', size: 11 }
              }
            }
          }
        }
      });
    }

    function renderKelulusanDonutChart(lulus, tidakLulus, tingkatKelulusan) {
      const ctx = document.getElementById('chartKelulusan');
      if (!ctx) return;
      if (appState.chartInstances.kelulusan) {
        appState.chartInstances.kelulusan.destroy();
      }

      const lCount = Number(lulus) || 0;
      const tlCount = Number(tidakLulus) || 0;
      const total = lCount + tlCount;
      const pctStr = total > 0 ? ((lCount / total) * 100).toFixed(1) : (tingkatKelulusan !== undefined ? String(tingkatKelulusan) : '0.0');

      const chartData = total > 0 ? [lCount, tlCount] : [0, 1];
      const chartColors = total > 0 ? ['#10B981', '#F43F5E'] : ['#E2E8F0', '#E2E8F0'];

      appState.chartInstances.kelulusan = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Lulus', 'Belum Lulus'],
          datasets: [{
            data: chartData,
            backgroundColor: chartColors,
            borderWidth: 2,
            borderColor: '#ffffff',
            hoverOffset: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: total > 0,
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              titleFont: { family: 'Poppins', size: 12, weight: '600' },
              bodyFont: { family: 'Inter', size: 11.5 },
              padding: 9,
              cornerRadius: 7,
              callbacks: {
                label: ctx => {
                  const val = ctx.raw || 0;
                  const p = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return '  ' + ctx.label + ': ' + val + ' Peserta (' + p + '%)';
                }
              }
            }
          }
        },
        plugins: [{
          id: 'centerTextKelulusan',
          beforeDraw: function(chart) {
            const { width, height, ctx } = chart;
            ctx.save();
            ctx.font = '700 19px Poppins, sans-serif';
            ctx.fillStyle = '#0F172A';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pctStr + '%', width / 2, height / 2 - 5);

            ctx.font = '500 10.5px Inter, sans-serif';
            ctx.fillStyle = '#64748B';
            ctx.fillText('Lulus', width / 2, height / 2 + 13);
            ctx.restore();
          }
        }]
      });

      // Update panel mini stats di bawah Donut
      const miniEl = document.getElementById('kelulusanMiniStats');
      if (miniEl) {
        miniEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:4px 8px;background:rgba(16,185,129,0.08);border-radius:6px;">
            <span style="color:#065F46;font-weight:600;display:flex;align-items:center;gap:5px;">
              <span style="width:7px;height:7px;border-radius:50%;background:#10B981;display:inline-block;"></span>Lulus
            </span>
            <strong style="color:#065F46;">${lCount} Siswa</strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:4px 8px;background:rgba(244,63,94,0.08);border-radius:6px;">
            <span style="color:#9F1239;font-weight:600;display:flex;align-items:center;gap:5px;">
              <span style="width:7px;height:7px;border-radius:50%;background:#F43F5E;display:inline-block;"></span>Belum Lulus
            </span>
            <strong style="color:#9F1239;">${tlCount} Siswa</strong>
          </div>`;
      }
    }

    function getActivityBadgeConfig(actionStr) {
      const a = String(actionStr || '').toLowerCase();
      if (a.includes('submit') || a.includes('selesai')) {
        return { label: 'Submit', badgeClass: 'badge-feed-success', icon: 'bi-check2-circle', iconBg: 'feed-icon-success' };
      }
      if (a.includes('login') || a.includes('verifikasi')) {
        return { label: 'Auth', badgeClass: 'badge-feed-info', icon: 'bi-box-arrow-in-right', iconBg: 'feed-icon-info' };
      }
      if (a.includes('mulai') || a.includes('resume') || a.includes('lanjut')) {
        return { label: 'Exam', badgeClass: 'badge-feed-warning', icon: 'bi-play-circle', iconBg: 'feed-icon-warning' };
      }
      if (a.includes('generate') || a.includes('import') || a.includes('buat') || a.includes('tambah') || a.includes('edit')) {
        return { label: 'Setup', badgeClass: 'badge-feed-purple', icon: 'bi-gear-wide-connected', iconBg: 'feed-icon-purple' };
      }
      return { label: 'Aksi', badgeClass: 'badge-feed-neutral', icon: 'bi-activity', iconBg: 'feed-icon-neutral' };
    }

    function renderDashboardRecentLogs(logs) {
      const container = document.getElementById('recentActivityList');
      if (!container) return;
      if (!logs || !logs.length) {
        container.innerHTML = '<div class="empty-state" style="padding:24px 0;"><i class="bi bi-inbox"></i>Belum ada aktivitas tercatat.</div>';
        return;
      }

      container.innerHTML = '<div class="activity-feed-list">' + logs.map(l => {
        const badge = getActivityBadgeConfig(l.Aksi);
        const userName = escapeHtml(l.Nama_User || 'Sistem');
        const actionTitle = escapeHtml(l.Aksi || 'Aktivitas');
        const detail = escapeHtml(l.Detail || '');
        const timeStr = formatDate(l.Timestamp);

        return `
          <div class="activity-feed-item">
            <div class="activity-feed-icon ${badge.iconBg}">
              <i class="bi ${badge.icon}"></i>
            </div>
            <div class="activity-feed-content">
              <div class="activity-feed-header">
                <span class="activity-user-name" title="${userName}">${userName}</span>
                <span class="activity-action-badge ${badge.badgeClass}">${badge.label}</span>
              </div>
              <div class="activity-action-title">${actionTitle}</div>
              ${detail ? `<div class="activity-detail">${detail}</div>` : ''}
              <div class="activity-time"><i class="bi bi-clock"></i> ${timeStr}</div>
            </div>
          </div>`;
      }).join('') + '</div>';
    }

    // ════════════════════════════════════════════════════════
    function loadLecturers() {
      loadAdmins();
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) return;
          window._lecturersCache = res.data || [];
          document.getElementById('lecturerTableBody').innerHTML = res.data.length ? res.data.map(d => {
            const safeName = escapeHtml(d.Nama || '');
            const initial = escapeHtml((d.Nama || 'D').charAt(0).toUpperCase());
            const emailDisplay = d.Email
              ? `<span style="font-weight:500;">${escapeHtml(d.Email)}</span>`
              : `<span class="badge-pill badge-warning" title="Akun lama belum memiliki email">Belum ada email</span>` +
                (d.Username ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Username lama: ${escapeHtml(d.Username)}</div>` : '');
            const nextStatus = d.Status === 'Aktif' ? 'Nonaktif' : 'Aktif';
            const toggleIcon = d.Status === 'Aktif' ? 'bi-toggle2-on' : 'bi-toggle2-off';
            return `
            <tr>
              <td><div class="avatar-circle" style="display:inline-flex;width:28px;height:28px;font-size:11px;margin-right:8px;">${initial}</div>${safeName}</td>
              <td>${emailDisplay}</td>
              <td>${d.Status === 'Aktif' ? '<span class="badge-pill badge-success"><span class="dot"></span>Aktif</span>' : '<span class="badge-pill badge-neutral"><span class="dot"></span>Nonaktif</span>'}</td>
              <td>
                <button class="btn-icon-sm" title="Edit Nama & Email" onclick="openEditLecturerModal('${d.ID_Dosen}')"><i class="bi bi-pencil-square"></i></button>
                <button class="btn-icon-sm" title="${d.Status === 'Aktif' ? 'Nonaktifkan Akses' : 'Aktifkan Akses'}" onclick="toggleLecturer('${d.ID_Dosen}','${nextStatus}')"><i class="bi ${toggleIcon}"></i></button>
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="4"><div class="empty-state"><i class="bi bi-person-x"></i>Belum ada dosen terdaftar.</div></td></tr>`;
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getAllLecturers();
    }

    function openAddLecturerModal() {
      document.getElementById('editLecturerId').value = '';
      document.getElementById('newLecturerName').value = '';
      document.getElementById('newLecturerEmail').value = '';
      document.getElementById('modalLecturerTitle').innerHTML = '<i class="bi bi-person-plus"></i> Tambah Akun Dosen Penguji';
      openModal('modalAddLecturer');
    }

    function openEditLecturerModal(idDosen) {
      const lecturer = (window._lecturersCache || []).find(d => d.ID_Dosen === idDosen);
      if (!lecturer) return;
      document.getElementById('editLecturerId').value = lecturer.ID_Dosen;
      document.getElementById('newLecturerName').value = lecturer.Nama || '';
      document.getElementById('newLecturerEmail').value = lecturer.Email || '';
      document.getElementById('modalLecturerTitle').innerHTML = '<i class="bi bi-pencil-square"></i> Edit Email &amp; Nama Dosen';
      openModal('modalAddLecturer');
    }

    function submitAddLecturer() {
      const idEdit = document.getElementById('editLecturerId').value.trim();
      const nama = document.getElementById('newLecturerName').value.trim();
      const email = document.getElementById('newLecturerEmail').value.trim().toLowerCase();
      if (!nama || !email) { showToast('Peringatan', 'Nama dan alamat email wajib diisi.', 'warning'); return; }

      const handler = res => {
        if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
        if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
        closeModal('modalAddLecturer');
        showToast('Berhasil', res.message, 'success');
        loadLecturers();
      };

      if (idEdit) {
        gasRun
          .withSuccessHandler(handler)
          .withFailureHandler(err => showToast('Error', err.message, 'danger'))
          .updateLecturer(idEdit, nama, email);
      } else {
        gasRun
          .withSuccessHandler(handler)
          .withFailureHandler(err => showToast('Error', err.message, 'danger'))
          .addLecturer(nama, email, 'Aktif');
      }
    }

    function toggleLecturer(id, statusBaru) {
      gasRun.withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; } showToast(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'danger'); loadLecturers(); }).toggleLecturerStatus(id, statusBaru);
    }

    function loadAdmins() {
      const tbody = document.getElementById('adminTableBody');
      if (!tbody) return;
      gasRun
        .withSuccessHandler(res => {
          if (!res || !res.success) return;
          const rows = res.data || [];
          window._adminsCache = rows;
          const currentId = appState.staff ? appState.staff.ID_Admin : null;
          tbody.innerHTML = rows.length ? rows.map(a => {
            const safeName = escapeHtml(a.Nama || '');
            const initial = escapeHtml((a.Nama || 'A').charAt(0).toUpperCase());
            const isCurrent = currentId && a.ID_Admin === currentId;
            const emailDisplay = a.Email
              ? `<span style="font-weight:500;">${escapeHtml(a.Email)}</span>`
              : `<span class="badge-pill badge-warning">Belum ada email</span>`;
            const noteBadge = isCurrent
              ? '<span class="badge-pill badge-primary"><span class="dot"></span>Sesi Anda Saat Ini</span>'
              : '<span class="badge-pill badge-success"><span class="dot"></span>Aktif</span>';
            const deleteBtn = (!isCurrent && rows.length > 1)
              ? `<button class="btn-icon-sm" style="color:var(--danger);" title="Hapus Akses Admin" onclick="deleteAdminAccount('${a.ID_Admin}')"><i class="bi bi-trash"></i></button>`
              : `<button class="btn-icon-sm" disabled title="${isCurrent ? 'Tidak dapat menghapus akun sendiri' : 'Minimal 1 admin harus tersisa'}" style="opacity:0.4;cursor:not-allowed;"><i class="bi bi-lock"></i></button>`;
            return `
            <tr>
              <td><div class="avatar-circle" style="display:inline-flex;width:28px;height:28px;font-size:11px;margin-right:8px;background:var(--primary-50);color:var(--primary);">${initial}</div>${safeName}</td>
              <td>${emailDisplay}</td>
              <td>${noteBadge}</td>
              <td>
                <button class="btn-icon-sm" title="Edit Nama & Email Admin" onclick="openEditAdminModal('${a.ID_Admin}')"><i class="bi bi-pencil-square"></i></button>
                ${deleteBtn}
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="4"><div class="empty-state"><i class="bi bi-shield-x"></i>Belum ada administrator terdaftar.</div></td></tr>`;
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getAllAdmins();
    }

    function openAddAdminModal() {
      document.getElementById('editAdminId').value = '';
      document.getElementById('newAdminName').value = '';
      document.getElementById('newAdminEmail').value = '';
      document.getElementById('modalAdminTitle').innerHTML = '<i class="bi bi-shield-plus"></i> Tambah Email Administrator';
      openModal('modalAddAdmin');
    }

    function openEditAdminModal(idAdmin) {
      const admin = (window._adminsCache || []).find(a => a.ID_Admin === idAdmin);
      if (!admin) return;
      document.getElementById('editAdminId').value = admin.ID_Admin;
      document.getElementById('newAdminName').value = admin.Nama || '';
      document.getElementById('newAdminEmail').value = admin.Email || '';
      document.getElementById('modalAdminTitle').innerHTML = '<i class="bi bi-pencil-square"></i> Edit Email Administrator';
      openModal('modalAddAdmin');
    }

    function submitAddAdmin() {
      const idEdit = document.getElementById('editAdminId').value.trim();
      const nama = document.getElementById('newAdminName').value.trim();
      const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
      if (!nama || !email) { showToast('Peringatan', 'Nama dan alamat email wajib diisi.', 'warning'); return; }

      const handler = res => {
        if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
        if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
        closeModal('modalAddAdmin');
        showToast('Berhasil', res.message, 'success');
        if (idEdit && appState.staff && appState.staff.ID_Admin === idEdit) {
          appState.staff.Nama = nama;
          appState.staff.Email = email;
          localStorage.setItem('cbt_staff', JSON.stringify(appState.staff));
          document.getElementById('staffNameLabel').textContent = nama;
          document.getElementById('staffAvatar').textContent = nama.charAt(0).toUpperCase();
        }
        loadAdmins();
      };

      if (idEdit) {
        gasRun
          .withSuccessHandler(handler)
          .withFailureHandler(err => showToast('Error', err.message, 'danger'))
          .updateAdmin(idEdit, nama, email);
      } else {
        gasRun
          .withSuccessHandler(handler)
          .withFailureHandler(err => showToast('Error', err.message, 'danger'))
          .addAdmin(nama, email);
      }
    }

    function deleteAdminAccount(idAdmin) {
      const admin = (window._adminsCache || []).find(a => a.ID_Admin === idAdmin);
      const label = admin ? `${admin.Nama} (${admin.Email || '-'})` : idAdmin;
      if (!confirm(`Hapus akses login Administrator untuk ${label}?`)) return;
      const currentAdminId = appState.staff ? appState.staff.ID_Admin : null;
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT.', 'danger'); return; }
          showToast(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'danger');
          if (res.success) loadAdmins();
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .deleteAdmin(idAdmin, currentAdminId);
    }

    function copyCredentialField(fieldId, btnEl) {
      const field = document.getElementById(fieldId);
      field.select();
      navigator.clipboard.writeText(field.value).then(() => {
        const original = btnEl.innerHTML;
        btnEl.innerHTML = '<i class="bi bi-check-lg"></i>';
        setTimeout(() => btnEl.innerHTML = original, 1200);
      }).catch(() => showToast('Gagal', 'Tidak dapat menyalin otomatis, silakan salin manual.', 'warning'));
    }
    
    // ════════════════════════════════════════════════════════
    // ADMIN — PESERTA & KODE AKSES
    // ════════════════════════════════════════════════════════
    // ════════════════════════════════════════════════════════
    // ADMIN — PESERTA & KODE AKSES (UI/UX PROFESIONAL)
    // ════════════════════════════════════════════════════════
    window._participantFilter = {
      status: 'Aktif', // DEFAULT: Hanya tampilkan kode aktif/siap pakai agar kode terpakai otomatis tersembunyi
      search: '',
      examId: '',
      rombel: ''
    };

    function loadParticipants() {
      const tbody = document.getElementById('participantTableBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7"><div class="skeleton" style="height:36px;"></div></td></tr>`;

      gasRun
        .withSuccessHandler(res => {
          if (!res) {
            showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger');
            return;
          }
          if (!res.success) return;
          window._participantsCache = res.data || [];
          populateParticipantFilterOptions(window._participantsCache);
          renderParticipantsTable();
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getAllParticipants();

      // Isi dropdown ujian target untuk modal generate, modal cetak & filter tabel
      gasRun.withSuccessHandler(res => {
        if (!res || !res.success) return;
        window._examsListCache = res.data;
        const examOpts = res.data.map(u => `<option value="${u.ID_Ujian}">${escapeHtml(u.Nama_Ujian)}</option>`).join('');
        const genSelect = document.getElementById('genCodeExamSelect');
        if (genSelect) genSelect.innerHTML = examOpts;
        const printSelect = document.getElementById('printCodesExamSelect');
        if (printSelect) printSelect.innerHTML = '<option value="">Semua Ujian (semua kode akses)</option>' + examOpts;
        populateParticipantFilterOptions(window._participantsCache || []);
      }).getAllExamsAdmin();
    }

    function populateParticipantFilterOptions(data) {
      const examFilter = document.getElementById('participantExamFilter');
      if (examFilter && window._examsListCache) {
        const currentVal = examFilter.value;
        const examIds = Array.from(new Set(data.map(p => p.ID_Ujian_Target).filter(Boolean)));
        examFilter.innerHTML = '<option value="">Semua Ujian Target</option>' +
          examIds.map(id => {
            const exam = (window._examsListCache || []).find(u => u.ID_Ujian === id);
            const name = exam ? exam.Nama_Ujian : id;
            return `<option value="${id}">${escapeHtml(name)}</option>`;
          }).join('');
        examFilter.value = currentVal;
      }

      const rombelFilter = document.getElementById('participantRombelFilter');
      if (rombelFilter) {
        const currentVal = rombelFilter.value;
        const rombels = Array.from(new Set(data.map(p => p.Rombel || 'Umum').filter(Boolean))).sort();
        rombelFilter.innerHTML = '<option value="">Semua Rombel</option>' +
          rombels.map(r => `<option value="${r}">${escapeHtml(r)}</option>`).join('');
        rombelFilter.value = currentVal;
      }
    }

    function setParticipantStatusFilter(status, el) {
      window._participantFilter.status = status;
      const pills = document.querySelectorAll('#participantStatusTabs .tab-pill');
      pills.forEach(p => p.classList.remove('active'));
      if (el) el.classList.add('active');
      renderParticipantsTable();
    }

    function handleParticipantFilterChange() {
      const searchInput = document.getElementById('participantSearchInput');
      const examFilter = document.getElementById('participantExamFilter');
      const rombelFilter = document.getElementById('participantRombelFilter');

      window._participantFilter.search = searchInput ? searchInput.value.trim().toLowerCase() : '';
      window._participantFilter.examId = examFilter ? examFilter.value : '';
      window._participantFilter.rombel = rombelFilter ? rombelFilter.value : '';

      renderParticipantsTable();
    }

    function renderParticipantsTable() {
      const all = window._participantsCache || [];
      const tbody = document.getElementById('participantTableBody');
      if (!tbody) return;

      // 1. Hitung metrik keseluruhan
      const countTotal = all.length;
      const countActive = all.filter(p => p.Status_Kode === 'Aktif').length;
      const countUsed = all.filter(p => p.Status_Kode === 'Used').length;
      const countExpired = all.filter(p => p.Status_Kode === 'Expired').length;

      // Update badge angka di tab filter
      const tabAll = document.getElementById('countTabAll'); if (tabAll) tabAll.textContent = countTotal;
      const tabAct = document.getElementById('countTabActive'); if (tabAct) tabAct.textContent = countActive;
      const tabUsd = document.getElementById('countTabUsed'); if (tabUsd) tabUsd.textContent = countUsed;
      const tabExp = document.getElementById('countTabExpired'); if (tabExp) tabExp.textContent = countExpired;

      // Update kartu metrik ringkasan di atas tabel
      const metricsWrap = document.getElementById('participantMetricCards');
      if (metricsWrap) {
        metricsWrap.innerHTML = `
          ${statCard('bi-key-fill', 'icon-bg-teal', countTotal, 'Total Kode Dibuat')}
          ${statCard('bi-check-circle-fill', 'icon-bg-success', countActive, 'Siap Pakai (Aktif)')}
          ${statCard('bi-mortarboard-fill', 'icon-bg-indigo', countUsed, 'Peserta Selesai (Used)')}
          ${statCard('bi-dash-circle-fill', 'icon-bg-coral', countExpired, 'Nonaktif / Kedaluwarsa')}
        `;
      }

      // 2. Terapkan filter
      const f = window._participantFilter;
      let filtered = all.filter(p => {
        if (f.status && f.status !== 'all') {
          if (p.Status_Kode !== f.status) return false;
        }
        if (f.examId && p.ID_Ujian_Target !== f.examId) return false;
        if (f.rombel && (p.Rombel || 'Umum') !== f.rombel) return false;
        if (f.search) {
          const name = (p.Nama || '').toLowerCase();
          const code = (p.Kode_Akses || '').toLowerCase();
          const contact = (p.Kontak || '').toLowerCase();
          if (!name.includes(f.search) && !code.includes(f.search) && !contact.includes(f.search)) {
            return false;
          }
        }
        return true;
      });

      // Update label jumlah hasil filter
      const countLabel = document.getElementById('participantFilteredCountLabel');
      if (countLabel) {
        countLabel.textContent = `Menampilkan ${filtered.length} dari ${countTotal} peserta`;
      }

      if (!filtered.length) {
        let msg = 'Tidak ada peserta yang cocok dengan kriteria filter saat ini.';
        if (f.status === 'Aktif' && countActive === 0 && countTotal > 0) {
          msg = 'Seluruh kode akses telah selesai digunakan atau dinonaktifkan. Buka tab <strong>"Semua"</strong> atau <strong>"Sudah Ujian"</strong> untuk melihat riwayat.';
        } else if (countTotal === 0) {
          msg = 'Belum ada kode akses yang dibuat. Silakan klik tombol <strong>"Buat Kode Akses Massal"</strong> atau <strong>"Import Peserta CSV"</strong> di atas.';
        }
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="bi bi-funnel"></i>${msg}</div></td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(p => {
        const isUsed = p.Status_Kode === 'Used';
        const isExpired = p.Status_Kode === 'Expired';
        const isActive = p.Status_Kode === 'Aktif';
        const isLocked = Boolean(p.Active_Token);

        const rowStyle = isUsed ? 'opacity:0.88;background:rgba(15,118,110,0.02);' : isExpired ? 'opacity:0.65;' : '';
        const examName = getExamNameById(p.ID_Ujian_Target);

        const resetSessionBtn = isLocked
          ? `<button class="btn-icon-sm" style="color:#d97706;" title="Reset Kunci Perangkat (Unlock)" onclick="resetDeviceSession('${p.ID_Peserta}', '${escapeHtml(p.Nama || 'Peserta')}')"><i class="bi bi-unlock"></i></button>`
          : '';

        // Aksi Kontekstual Sesuai Status
        let actionButtons = '';
        if (isActive) {
          actionButtons = `
            <div style="display:flex;gap:5px;justify-content:flex-end;align-items:center;">
              ${resetSessionBtn}
              <button class="btn-icon-sm" style="color:#25D366;" title="Kirim Akses via WhatsApp" onclick="sendWhatsAppCode('${p.ID_Peserta}')"><i class="bi bi-whatsapp"></i></button>
              <button class="btn-icon-sm" title="Cetak Slip Kartu (Thermal/A4)" onclick="printSingleThermalSlip('${p.ID_Peserta}')"><i class="bi bi-printer"></i></button>
              <button class="btn-icon-sm" title="Salin Kode Akses" onclick="copyAccessCode('${p.Kode_Akses}')"><i class="bi bi-clipboard"></i></button>
              <button class="btn-icon-sm" title="Nonaktifkan" onclick="deactivateCode('${p.ID_Peserta}')"><i class="bi bi-slash-circle"></i></button>
            </div>`;
        } else if (isUsed) {
          actionButtons = `
            <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center;">
              ${resetSessionBtn}
              <button class="btn-icon-sm" title="Cetak Bukti Nilai Thermal" onclick="printScoreReceiptThermal('${p.ID_Peserta}')"><i class="bi bi-receipt"></i></button>
              <button class="btn-cbt btn-cbt-outline" style="padding:4px 10px;font-size:11.5px;" onclick="viewParticipantScoreDetail('${p.ID_Peserta}', '${escapeHtml(p.Nama || 'Peserta')}')">
                <i class="bi bi-bar-chart-line"></i> Lihat Nilai
              </button>
            </div>`;
        } else {
          // Expired / Nonaktif
          actionButtons = `
            <div style="display:flex;gap:5px;justify-content:flex-end;align-items:center;">
              ${resetSessionBtn}
              <button class="btn-icon-sm" title="Aktifkan Kembali" onclick="reactivateCode('${p.ID_Peserta}')"><i class="bi bi-arrow-counterclockwise"></i></button>
              <button class="btn-icon-sm" style="color:var(--danger);" title="Hapus Data Peserta" onclick="deleteParticipant('${p.ID_Peserta}', '${escapeHtml(p.Nama || p.Kode_Akses)}')"><i class="bi bi-trash"></i></button>
            </div>`;
        }

        return `
          <tr style="${rowStyle}">
            <td>
              <div style="font-weight:600;font-size:13.5px;">${escapeHtml(p.Nama) || '<em style="color:var(--text-muted);font-weight:normal;">Belum login</em>'}</div>
              <div style="font-size:11px;color:var(--text-muted);">${p.Tanggal_Daftar ? new Date(p.Tanggal_Daftar).toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'}) : '-'}</div>
            </td>
            <td>${escapeHtml(p.Kontak) || '<span style="color:var(--text-muted);">-</span>'}</td>
            <td><span class="badge-pill badge-indigo">${escapeHtml(p.Rombel || 'Umum')}</span></td>
            <td>
              <div style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-canvas);padding:3px 8px;border-radius:6px;border:1px solid var(--border-color);">
                <code style="font-size:13px;font-weight:700;color:var(--primary);">${p.Kode_Akses}</code>
                <i class="bi bi-copy" style="cursor:pointer;font-size:11.5px;color:var(--text-muted);" title="Salin Kode" onclick="copyAccessCode('${p.Kode_Akses}')"></i>
              </div>
            </td>
            <td><span style="font-size:12.5px;font-weight:500;">${escapeHtml(examName)}</span></td>
            <td>${accessStatusBadge(p.Status_Kode, isLocked, p.Device_Info)}</td>
            <td style="text-align:right;">${actionButtons}</td>
          </tr>
        `;
      }).join('');
    }

    function copyAccessCode(code) {
      if (!code) return;
      navigator.clipboard.writeText(code).then(() => {
        showToast('Kode Disalin', `Kode akses <strong>${code}</strong> berhasil disalin ke clipboard.`, 'success');
      }).catch(() => {
        const el = document.createElement('textarea');
        el.value = code;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        showToast('Kode Disalin', `Kode akses <strong>${code}</strong> berhasil disalin.`, 'success');
      });
    }

    function accessStatusBadge(status, isLocked, deviceInfo) {
      const map = { Aktif: 'badge-success', Used: 'badge-indigo', Expired: 'badge-neutral' };
      let html = `<span class="badge-pill ${map[status] || 'badge-neutral'}"><span class="dot"></span>${status}</span>`;
      if (isLocked) {
        html += ` <span class="badge-pill badge-warning" style="margin-left:4px;" title="${escapeHtml(deviceInfo || 'Perangkat Terkunci')}"><i class="bi bi-laptop"></i> Terkunci</span>`;
      }
      return html;
    }

    function resetDeviceSession(idPeserta, nama) {
      if (!confirm(`Reset kunci sesi perangkat untuk "${nama || idPeserta}"?\n\nTindakan ini akan membebaskan kunci sesi sehingga peserta dapat login kembali di komputer lain jika perangkat sebelumnya mengalami kendala teknis atau mati.`)) {
        return;
      }
      showToast('Memproses...', 'Membuka kunci sesi perangkat...', 'info');
      gasRun
        .withSuccessHandler(res => {
          if (!res) return;
          if (res.success) {
            showToast('Kunci Dilepas', res.message, 'success');
            loadParticipants();
          } else {
            showToast('Gagal', res.message, 'danger');
          }
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .resetParticipantSession(idPeserta);
    }
    function openGenerateCodesModal() { openModal('modalGenerateCodes'); }
    function submitGenerateCodes() {
      const idUjian = document.getElementById('genCodeExamSelect').value;
      const jumlah = Number(document.getElementById('genCodeJumlah').value);
      const prefix = document.getElementById('genCodePrefix').value.trim().toUpperCase();
      const rombel = document.getElementById('genCodeRombel').value.trim();
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          closeModal('modalGenerateCodes');
          if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
          showToast('Berhasil', res.message, 'success');
          loadParticipants();
          // Tawarkan cetak langsung untuk batch kode yang baru saja dibuat,
          // supaya tidak perlu membagikan kode satu per satu secara manual.
          const examName = (window._examsListCache || []).find(u => u.ID_Ujian === idUjian)?.Nama_Ujian || idUjian;
          offerPrintNewBatch(res.data.codes, examName);
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .generateAccessCodesBatch(idUjian, jumlah, prefix, rombel);
    }
    function deactivateCode(id) {
      gasRun.withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
          showToast(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'danger');
          loadParticipants();
      }).deactivateAccessCode(id);
    }

    function reactivateCode(idPeserta) {
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
          showToast(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'danger');
          loadParticipants();
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .reactivateAccessCode(idPeserta);
    }

    function deleteParticipant(idPeserta, nama) {
      if (!confirm(`Hapus permanen data peserta "${nama}"? Aksi ini tidak dapat dibatalkan.`)) return;
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
          showToast(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'danger');
          loadParticipants();
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .deleteParticipantAccess(idPeserta);
    }

    function viewParticipantScoreDetail(idPeserta, namaPeserta) {
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
          if (!res.success || !res.data) {
            showToast('Informasi', res.message || 'Hasil ujian belum tersedia.', 'warning');
            return;
          }
          const d = res.data;
          const examName = getExamNameById(d.ID_Ujian);
          const waktuSelesaiStr = d.Waktu_Selesai ? new Date(d.Waktu_Selesai).toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' }) : '-';

          document.getElementById('modalGenericContent').innerHTML = `
            <div class="modal-header-cbt">
              <span><i class="bi bi-file-earmark-person"></i> Rincian Hasil Ujian Peserta</span>
              <button style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;" onclick="closeModal('modalGeneric')">&times;</button>
            </div>
            <div class="modal-body-cbt">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                <div>
                  <h3 style="margin:0;font-size:17px;font-weight:700;">${escapeHtml(namaPeserta)}</h3>
                  <div style="font-size:12.5px;color:var(--text-muted);margin-top:2px;"><i class="bi bi-journal-bookmark"></i> ${escapeHtml(examName)}</div>
                  <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;"><i class="bi bi-clock-history"></i> Selesai: ${waktuSelesaiStr}</div>
                </div>
                <div>
                  <span class="badge-pill ${d.Status_Lulus === 'Lulus' ? 'badge-success' : 'badge-danger'}" style="font-size:12px;padding:6px 14px;">
                    <span class="dot"></span>${d.Status_Lulus === 'Lulus' ? 'LULUS' : 'TIDAK LULUS'}
                  </span>
                </div>
              </div>

              <!-- Skor Total -->
              <div class="card-cbt" style="text-align:center;padding:18px;background:var(--bg-canvas);border:1px solid var(--border-color);margin-bottom:16px;">
                <div style="font-size:11.5px;color:var(--text-muted);font-weight:600;letter-spacing:.04em;text-transform:uppercase;">TOTAL SKOR KONVERSI (TOEFL)</div>
                <div style="font-size:38px;font-weight:800;color:var(--primary);margin-top:4px;">${d.Skor_Total || 0}</div>
              </div>

              <!-- Rincian Nilai Per Seksi -->
              <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;">
                <div class="card-cbt" style="padding:12px;text-align:center;border-top:3px solid var(--primary);">
                  <div style="font-size:11px;color:var(--text-muted);font-weight:600;">LISTENING</div>
                  <div style="font-size:20px;font-weight:700;color:var(--text-main);margin-top:4px;">${d.Skor_Listening || 0}</div>
                  <div style="font-size:10.5px;color:var(--text-muted);">Jawaban Benar</div>
                </div>
                <div class="card-cbt" style="padding:12px;text-align:center;border-top:3px solid #F59E0B;">
                  <div style="font-size:11px;color:var(--text-muted);font-weight:600;">STRUCTURE</div>
                  <div style="font-size:20px;font-weight:700;color:var(--text-main);margin-top:4px;">${d.Skor_Grammar || 0}</div>
                  <div style="font-size:10.5px;color:var(--text-muted);">Jawaban Benar</div>
                </div>
                <div class="card-cbt" style="padding:12px;text-align:center;border-top:3px solid #6366F1;">
                  <div style="font-size:11px;color:var(--text-muted);font-weight:600;">READING</div>
                  <div style="font-size:20px;font-weight:700;color:var(--text-main);margin-top:4px;">${d.Skor_Reading || 0}</div>
                  <div style="font-size:10.5px;color:var(--text-muted);">Jawaban Benar</div>
                </div>
              </div>
            </div>
            <div class="modal-footer-cbt">
              <button class="btn-cbt btn-cbt-ghost" onclick="closeModal('modalGeneric')">Tutup</button>
            </div>
          `;
          openModal('modalGeneric');
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getParticipantResultDetail(idPeserta);
    }
    
    // ════════════════════════════════════════════════════════
    // CETAK / UNDUH KODE AKSES — supaya tidak perlu dibagikan satu per satu
    // ════════════════════════════════════════════════════════
    function openPrintCodesModal() { openModal('modalPrintCodes'); }
    
    function getExamNameById(idUjian) {
      const found = (window._examsListCache || []).find(u => u.ID_Ujian === idUjian);
      return found ? found.Nama_Ujian : (idUjian || '-');
    }
    
    function buildPrintableCodesHtml(codesData, headingText) {
      // codesData: array of { nama, kode, ujian, status }
      const cardsHtml = codesData.map(c => `
        <div class="pcard">
          <div class="pcard-label">Kode Akses Peserta</div>
          <div class="pcard-code">${c.kode}</div>
          <div class="pcard-exam">${c.ujian}</div>
          ${c.nama ? `<div class="pcard-nama">Untuk: ${c.nama}</div>` : ''}
        </div>`).join('');
    
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cetak Kode Akses - CBT Bahasa</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 24px; color: #0F172A; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .subtitle { color: #64748B; font-size: 12.5px; margin-bottom: 20px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
          .pcard { border: 1.5px dashed #94A3B8; border-radius: 10px; padding: 16px 14px; text-align: center; page-break-inside: avoid; }
          .pcard-label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748B; margin-bottom: 6px; }
          .pcard-code { font-size: 22px; font-weight: 700; letter-spacing: 1px; color: #0F766E; font-family: monospace; margin-bottom: 8px; }
          .pcard-exam { font-size: 11.5px; color: #334155; font-weight: 600; }
          .pcard-nama { font-size: 11px; color: #64748B; margin-top: 4px; }
          .toolbar { margin-bottom: 20px; }
          .toolbar button { background: #F59E0B; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 13px; }
          @media print { .toolbar { display: none; } body { margin: 10mm; } }
        </style>
      </head><body>
        <div class="toolbar"><button onclick="window.print()">🖨️ Cetak Sekarang</button></div>
        <h1>${headingText}</h1>
        <div class="subtitle">CBT Bahasa — Total ${codesData.length} kode akses. Gunting/potong tiap kartu sesuai garis putus-putus untuk dibagikan satu per satu ke peserta.</div>
        <div class="grid">${cardsHtml}</div>
      </body></html>`;
    }
    
    function printAccessCodes() {
      const idUjian = document.getElementById('printCodesExamSelect').value;
      const format = document.getElementById('printCodesFormatSelect')?.value || 'a4';
      const all = window._participantsCache || [];
      // Hanya kode yang BELUM diakses (status 'Aktif') yang boleh dicetak/dibagikan —
      // kode yang sudah 'Used' atau 'Expired' tidak berguna lagi untuk peserta baru.
      let filtered = idUjian ? all.filter(p => p.ID_Ujian_Target === idUjian) : all;
      filtered = filtered.filter(p => p.Status_Kode === 'Aktif');
    
      if (!filtered.length) { showToast('Peringatan', 'Tidak ada kode akses yang masih aktif (belum dipakai) untuk dicetak pada pilihan ini.', 'warning'); return; }
    
      const codesData = filtered.map(p => ({
        nama: p.Nama || '',
        kode: p.Kode_Akses,
        ujian: getExamNameById(p.ID_Ujian_Target)
      }));
    
      const heading = idUjian ? `Kode Akses — ${getExamNameById(idUjian)}` : 'Kode Akses — Semua Ujian';
      const instName = appState.systemSettings?.institutionName || 'PUSAT LAYANAN BAHASA CBT';
      const win = window.open('', '_blank');

      if (format === 'thermal') {
        // Format Cetak Struk Roll Thermal POS (58mm / 80mm)
        const slipsHtml = codesData.map((c, i) => `
          <div class="thermal-slip" style="page-break-after:always;margin-bottom:14px;">
            <div class="title">${escapeHtml(instName)}</div>
            <div class="sub">KARTU UJIAN #${i + 1}</div>
            <div class="line"></div>
            <div class="row"><span>Nama:</span><span><strong>${escapeHtml(c.nama || 'Peserta Ujian')}</strong></span></div>
            <div class="row"><span>Ujian:</span><span>${escapeHtml(c.ujian)}</span></div>
            <div class="line"></div>
            <div style="font-size:10px;font-weight:bold;">KODE AKSES LOGIN:</div>
            <div class="code-box">${c.kode}</div>
            <div class="line"></div>
            <div class="footer">Jaga kerahasiaan kode login.<br>Dicetak: ${new Date().toLocaleDateString('id-ID')}</div>
          </div>
        `).join('');

        win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Slip Thermal - ${heading}</title>
          <style>
            body { margin: 0; padding: 10px; font-family: 'Courier New', monospace; background: #fff; color: #000; }
            .thermal-slip { max-width: 270px; margin: 0 auto; text-align: center; border: 1px dashed #444; padding: 12px; border-radius: 4px; }
            .title { font-size: 13px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
            .sub { font-size: 10px; color: #444; margin-bottom: 6px; }
            .line { border-top: 1px dashed #444; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px; text-align: left; }
            .code-box { font-size: 20px; font-weight: bold; letter-spacing: 2px; margin: 8px 0; padding: 6px; border: 1.5px solid #000; text-align: center; }
            .footer { font-size: 9px; color: #555; }
            @media print { body { padding: 0; } .thermal-slip { border: none; } .btn-print { display: none; } }
          </style>
        </head><body>
          <div style="text-align:center;margin-bottom:12px;" class="btn-print">
            <button onclick="window.print()" style="padding:8px 18px;font-weight:bold;cursor:pointer;background:#0F766E;color:#fff;border:none;border-radius:6px;">🖨️ Cetak Seluruh Slip Thermal (${codesData.length})</button>
          </div>
          ${slipsHtml}
        </body></html>`);
      } else {
        win.document.write(buildPrintableCodesHtml(codesData, heading));
      }

      win.document.close();
      closeModal('modalPrintCodes');
    }
    
    function downloadAccessCodesCsv() {
      const idUjian = document.getElementById('printCodesExamSelect').value;
      const all = window._participantsCache || [];
      // Sama seperti cetak: hanya kode berstatus 'Aktif' (belum diakses) yang diunduh.
      let filtered = idUjian ? all.filter(p => p.ID_Ujian_Target === idUjian) : all;
      filtered = filtered.filter(p => p.Status_Kode === 'Aktif');
    
      if (!filtered.length) { showToast('Peringatan', 'Tidak ada kode akses yang masih aktif (belum dipakai) untuk diunduh pada pilihan ini.', 'warning'); return; }
    
      const sanitizeCell = val => {
        if (val === null || val === undefined) return '""';
        let s = String(val).replace(/"/g, '""');
        if (/^[=\+\-@]/.test(s)) s = "'" + s;
        return `"${s}"`;
      };

      const rows = filtered.map(p => [p.Nama || '', p.Kontak || '', p.Kode_Akses, getExamNameById(p.ID_Ujian_Target), p.Status_Kode]);
      const csv = '\uFEFF' + 'Nama,Kontak,Kode Akses,Ujian Target,Status\r\n' + rows.map(r => r.map(sanitizeCell).join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'kode_akses_peserta.csv';
      link.click();
      closeModal('modalPrintCodes');
    }

    // ── Distribusi WhatsApp & Cetak Struk Thermal (Skill Enhancement) ──
    function sendWhatsAppCode(idPeserta) {
      const p = (window._participantsCache || []).find(x => x.ID_Peserta === idPeserta);
      if (!p) return;
      const examName = getExamNameById(p.ID_Ujian_Target);
      const instName = appState.systemSettings?.institutionName || 'Pusat Layanan Bahasa CBT';
      const url = window.location.origin;

      let cleanPhone = (p.Kontak || '').replace(/[^0-9]/g, '');
      if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);

      const text = `Halo *${p.Nama || 'Peserta Ujian'}*,\n\nBerikut adalah informasi akun CBT Kebahasaan Anda:\n🏛️ *Instansi*: ${instName}\n📝 *Paket Ujian*: ${examName}\n🏷️ *Rombel*: ${p.Rombel || 'Umum'}\n🔑 *Kode Akses*: *${p.Kode_Akses}*\n🌐 *Link Ujian*: ${url}\n\nSilakan buka tautan di atas dan masukkan kode akses Anda untuk login. Simpan pesan ini dengan baik.\nSemoga sukses dalam ujian!`;

      const waUrl = cleanPhone 
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

      window.open(waUrl, '_blank');
    }

    function copyWhatsAppBroadcastText() {
      const idUjian = document.getElementById('printCodesExamSelect').value;
      const all = window._participantsCache || [];
      let filtered = idUjian ? all.filter(p => p.ID_Ujian_Target === idUjian) : all;
      filtered = filtered.filter(p => p.Status_Kode === 'Aktif');

      if (!filtered.length) {
        showToast('Peringatan', 'Tidak ada kode akses aktif untuk dibuatkan teks broadcast.', 'warning');
        return;
      }

      const examName = idUjian ? getExamNameById(idUjian) : 'Ujian CBT';
      const instName = appState.systemSettings?.institutionName || 'Pusat Layanan Bahasa CBT';
      const url = window.location.origin;

      let text = `📢 *DAFTAR KODE AKSES UJIAN CBT*\n🏛️ *Instansi*: ${instName}\n📝 *Ujian*: ${examName}\n🌐 *Link Login*: ${url}\n\n`;
      filtered.forEach((p, idx) => {
        text += `${idx + 1}. *${p.Nama || 'Peserta'}* (${p.Rombel || 'Umum'}) ➔ Kode: \`${p.Kode_Akses}\`\n`;
      });
      text += `\n_Harap login tepat waktu dan simpan kode akses Anda masing-masing._`;

      navigator.clipboard.writeText(text).then(() => {
        showToast('Teks Disalin', `${filtered.length} format pesan broadcast WhatsApp berhasil disalin ke clipboard!`, 'success');
        closeModal('modalPrintCodes');
      }).catch(() => {
        showToast('Info', 'Gagal menyalin otomatis. Silakan unduh CSV.', 'warning');
      });
    }

    function printSingleThermalSlip(idPeserta) {
      const p = (window._participantsCache || []).find(x => x.ID_Peserta === idPeserta);
      if (!p) return;
      const examName = getExamNameById(p.ID_Ujian_Target);
      const instName = appState.systemSettings?.institutionName || 'PUSAT LAYANAN BAHASA';

      const slipHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Slip Ujian - ${p.Kode_Akses}</title>
        <style>
          body { margin: 0; padding: 12px; font-family: 'Courier New', monospace; background: #fff; color: #000; }
          .thermal-slip { max-width: 280px; margin: 0 auto; text-align: center; border: 1px dashed #444; padding: 14px; border-radius: 4px; }
          .title { font-size: 14px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
          .sub { font-size: 10px; color: #444; margin-bottom: 8px; }
          .line { border-top: 1px dashed #333; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; text-align: left; }
          .row span:first-child { color: #555; }
          .code-box { font-size: 22px; font-weight: bold; letter-spacing: 2px; margin: 10px 0; padding: 8px; border: 1.5px solid #000; text-align: center; }
          .footer { font-size: 9.5px; color: #555; margin-top: 8px; }
          @media print { body { padding: 0; } .thermal-slip { border: none; } .btn-print { display: none; } }
        </style>
      </head><body>
        <div style="text-align:center;margin-bottom:10px;" class="btn-print">
          <button onclick="window.print()" style="padding:7px 16px;font-weight:bold;cursor:pointer;background:#0F766E;color:#fff;border:none;border-radius:6px;">🖨️ Cetak Slip Thermal</button>
        </div>
        <div class="thermal-slip">
          <div class="title">${escapeHtml(instName)}</div>
          <div class="sub">KARTU LOGIN UJIAN CBT</div>
          <div class="line"></div>
          <div class="row"><span>Peserta:</span><span><strong>${escapeHtml(p.Nama || 'Peserta Ujian')}</strong></span></div>
          <div class="row"><span>Rombel:</span><span>${escapeHtml(p.Rombel || 'Umum')}</span></div>
          <div class="row"><span>Ujian:</span><span>${escapeHtml(examName)}</span></div>
          <div class="line"></div>
          <div style="font-size:10.5px;color:#333;font-weight:bold;">KODE AKSES LOGIN:</div>
          <div class="code-box">${p.Kode_Akses}</div>
          <div class="line"></div>
          <div class="footer">Jaga kerahasiaan kode login ini.<br>Dicetak: ${new Date().toLocaleString('id-ID')}</div>
        </div>
      </body></html>`;

      const w = window.open('', '_blank');
      w.document.write(slipHtml);
      w.document.close();
    }

    function printScoreReceiptThermal(idPeserta) {
      gasRun
        .withSuccessHandler(res => {
          if (!res || !res.success || !res.data) {
            showToast('Informasi', 'Data hasil ujian belum tersedia atau belum selesai.', 'warning');
            return;
          }
          const h = res.data;
          const instName = appState.systemSettings?.institutionName || 'PUSAT LAYANAN BAHASA';
          const examName = getExamNameById(h.ID_Ujian);

          const slipHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bukti Nilai - ${h.ID_Hasil}</title>
            <style>
              body { margin: 0; padding: 12px; font-family: 'Courier New', monospace; background: #fff; color: #000; }
              .thermal-slip { max-width: 280px; margin: 0 auto; text-align: center; border: 1px dashed #444; padding: 14px; border-radius: 4px; }
              .title { font-size: 14px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
              .sub { font-size: 10px; color: #444; margin-bottom: 8px; }
              .line { border-top: 1px dashed #333; margin: 8px 0; }
              .row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; text-align: left; }
              .total-box { font-size: 26px; font-weight: bold; margin: 10px 0; padding: 6px; border: 1.5px solid #000; text-align: center; }
              .footer { font-size: 9.5px; color: #555; margin-top: 8px; }
              @media print { body { padding: 0; } .thermal-slip { border: none; } .btn-print { display: none; } }
            </style>
          </head><body>
            <div style="text-align:center;margin-bottom:10px;" class="btn-print">
              <button onclick="window.print()" style="padding:7px 16px;font-weight:bold;cursor:pointer;background:#0F766E;color:#fff;border:none;border-radius:6px;">🖨️ Cetak Bukti Nilai Thermal</button>
            </div>
            <div class="thermal-slip">
              <div class="title">${escapeHtml(instName)}</div>
              <div class="sub">BUKTI HASIL TES CBT RESMI</div>
              <div class="line"></div>
              <div class="row"><span>Nama:</span><span><strong>${escapeHtml(h.Nama_Peserta || 'Peserta')}</strong></span></div>
              <div class="row"><span>Paket:</span><span>${escapeHtml(examName)}</span></div>
              <div class="row"><span>Tanggal:</span><span>${h.Waktu_Selesai ? new Date(h.Waktu_Selesai).toLocaleDateString('id-ID') : '-'}</span></div>
              <div class="line"></div>
              <div class="row"><span>Listening:</span><span>${h.Skor_Listening || 0}</span></div>
              <div class="row"><span>Structure:</span><span>${h.Skor_Grammar || 0}</span></div>
              <div class="row"><span>Reading:</span><span>${h.Skor_Reading || 0}</span></div>
              <div class="line"></div>
              <div style="font-size:10.5px;color:#333;font-weight:bold;">SKOR AKHIR TOTAL:</div>
              <div class="total-box">${h.Skor_Total || 0}</div>
              <div class="row" style="justify-content:center;font-weight:bold;">Status: ${h.Status_Lulus || 'Selesai'}</div>
              <div class="line"></div>
              <div class="footer">ID Hasil: ${h.ID_Hasil}<br>Hasil ini sah dan tercatat di database sistem.</div>
            </div>
          </body></html>`;

          const w = window.open('', '_blank');
          w.document.write(slipHtml);
          w.document.close();
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getParticipantResultDetail(idPeserta);
    }
    
    // Ditampilkan otomatis setelah generate kode massal baru, agar admin bisa
    // langsung mencetak batch tersebut tanpa perlu buka modal cetak terpisah.
    function offerPrintNewBatch(codes, examName) {
      document.getElementById('modalGenericContent').innerHTML = `
        <div class="modal-header-cbt"><span><i class="bi bi-printer"></i> ${codes.length} Kode Akses Berhasil Dibuat</span>
          <button style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;" onclick="closeModal('modalGeneric')">&times;</button></div>
        <div class="modal-body-cbt">
          <p style="font-size:13.5px;color:var(--text-muted);margin-top:0;">Ujian: <strong>${examName}</strong></p>
          <p style="font-size:13px;">Cetak sekarang sebagai kartu siap potong, atau buka nanti lewat tombol "Cetak / Unduh Kode Akses" di halaman ini.</p>
        </div>
        <div class="modal-footer-cbt">
          <button class="btn-cbt btn-cbt-ghost" onclick="closeModal('modalGeneric')">Nanti Saja</button>
          <button class="btn-cbt btn-cbt-primary" onclick="printNewBatchNow(${JSON.stringify(codes)}, '${examName.replace(/'/g,"")}')"><i class="bi bi-printer"></i> Cetak Sekarang</button>
        </div>`;
      openModal('modalGeneric');
    }
    function printNewBatchNow(codes, examName) {
      const codesData = codes.map(k => ({ nama: '', kode: k, ujian: examName }));
      const win = window.open('', '_blank');
      win.document.write(buildPrintableCodesHtml(codesData, `Kode Akses Baru — ${examName}`));
      win.document.close();
      closeModal('modalGeneric');
    }
    
    // ════════════════════════════════════════════════════════
    // ADMIN — KATALOG SEMUA UJIAN
    // ════════════════════════════════════════════════════════
    function loadAllExamsAdmin() {
      gasRun
        .withSuccessHandler(res => {
          if (!res) {
            showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger');
            document.getElementById('allExamsTableBody').innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);"><i class="bi bi-wifi-off" style="color:var(--danger);"></i>Tidak ada respons dari server.<br><span style="font-size:12px;">Pastikan server backend Vercel aktif dan database PostgreSQL telah terhubung.</span><br><button class="btn-cbt btn-cbt-outline" style="margin-top:10px;" onclick="loadAllExamsAdmin()"><i class="bi bi-arrow-clockwise"></i> Coba Lagi</button></div></td></tr>`;
            return;
          }
          if (!res.success) {
            showToast('Gagal Memuat', res.message, 'danger');
            document.getElementById('allExamsTableBody').innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);"><i class="bi bi-exclamation-triangle" style="color:var(--danger);"></i>Gagal memuat katalog ujian dari server:<br><code style="font-size:11.5px;">${res.message}</code></div></td></tr>`;
            return;
          }
          try {
            window._allExamsCache = res.data;
            document.getElementById('allExamsTableBody').innerHTML = res.data.length ? res.data.map(u => `
              <tr>
                <td><strong>${u.Nama_Ujian || '(Tanpa Nama)'}</strong><div style="font-size:11px;color:var(--text-muted);">${u.ID_Ujian} · ${u.jumlahSesi || 0} Sesi · ${u.jumlahSoal || 0} Soal</div></td>
                <td>${u.namaDosen || '-'}</td>
                <td>${formatDate(u.Tanggal_Buka)}</td>
                <td>${u.pesertaSelesai || 0}/${u.totalPeserta || 0}</td>
                <td>${statusBadge(u.Status)}</td>
                <td>
                  <button class="btn-icon-sm" title="Lihat Hasil" onclick="openExamResults('${u.ID_Ujian}','${(u.Nama_Ujian||'').replace(/'/g,"")}')"><i class="bi bi-eye"></i></button>
                  <button class="btn-icon-sm" title="Upload Soal" onclick="openUploadCsv('${u.ID_Ujian}','${(u.Nama_Ujian||'').replace(/'/g,"")}')"><i class="bi bi-cloud-upload"></i></button>
                  <button class="btn-icon-sm" title="Kelola Soal" onclick="openManageQuestions('${u.ID_Ujian}','${(u.Nama_Ujian||'').replace(/'/g,"")}')"><i class="bi bi-list-ul"></i></button>
                  <button class="btn-icon-sm" title="Edit" onclick="editExam('${u.ID_Ujian}')"><i class="bi bi-pencil"></i></button>
                  <button class="btn-icon-sm" title="Ubah Dosen Pengampu" onclick="openReassignDosenModal('${u.ID_Ujian}','${(u.Nama_Ujian||'').replace(/'/g,"")}','${u.ID_Dosen_Pembuat || 'ADMIN'}')"><i class="bi bi-person-gear"></i></button>
                </td>
              </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-journal-x"></i>Belum ada ujian dibuat oleh dosen ataupun admin.</div></td></tr>`;
          } catch (renderErr) {
            showToast('Error Tampilan', 'Gagal menampilkan katalog ujian: ' + renderErr.message, 'danger');
            document.getElementById('allExamsTableBody').innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);"><i class="bi bi-exclamation-triangle" style="color:var(--danger);"></i>Gagal menampilkan katalog ujian:<br><code style="font-size:11.5px;">${renderErr.message}</code></div></td></tr>`;
          }
        })
        .withFailureHandler(err => {
          showToast('Error', err.message, 'danger');
          document.getElementById('allExamsTableBody').innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);"><i class="bi bi-exclamation-triangle" style="color:var(--danger);"></i>Gagal terhubung ke server:<br><code style="font-size:11.5px;">${err.message}</code></div></td></tr>`;
        })
        .getAllExamsAdmin();
    }
    
    // Admin: buka modal untuk menugaskan/mengubah dosen pengampu suatu ujian
    function openReassignDosenModal(idUjian, namaUjian, currentDosenId) {
      window._reassignTargetExamId = idUjian;
      document.getElementById('reassignExamNameLabel').textContent = namaUjian;
      gasRun.withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
        if (!res.success) return;
        const select = document.getElementById('reassignDosenSelect');
        select.innerHTML = '<option value="ADMIN">Dikelola Langsung oleh Admin</option>' +
          res.data.filter(d => d.Status === 'Aktif').map(d => `<option value="${d.ID_Dosen}">${d.Nama}</option>`).join('');
        select.value = currentDosenId || 'ADMIN';
      }).getAllLecturers();
      openModal('modalReassignDosen');
    }
    
    function submitReassignDosen() {
      const idDosenBaru = document.getElementById('reassignDosenSelect').value;
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          closeModal('modalReassignDosen');
          if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
          showToast('Berhasil', res.message, 'success');
          loadAllExamsAdmin();
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .reassignExamLecturer(window._reassignTargetExamId, idDosenBaru);
    }
    
    // ════════════════════════════════════════════════════════
    // ADMIN — LAPORAN GLOBAL
    // ════════════════════════════════════════════════════════
    function loadGlobalReport() {
      const filterUjian = document.getElementById('reportExamFilter').value;
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) return;
          window._globalReportCache = res.data;
          const total = res.data.length;
          const lulus = res.data.filter(h => h.Status_Lulus === 'Lulus').length;
          const avg = total ? Math.round(res.data.reduce((s,h) => s+Number(h.Skor_Total),0)/total) : 0;
          document.getElementById('reportStatCards').innerHTML =
            statCard('bi-people','icon-bg-teal', total, 'Total Entri') +
            statCard('bi-check-circle','icon-bg-amber', lulus, 'Lulus') +
            statCard('bi-x-circle','icon-bg-coral', total-lulus, 'Tidak Lulus') +
            statCard('bi-graph-up','icon-bg-indigo', avg, 'Rata-rata Skor');
    
          document.getElementById('globalReportTableBody').innerHTML = total ? res.data.map(h => `
            <tr><td>${h.Nama_Peserta}</td><td>${h.ID_Ujian}</td><td>${h.Skor_Listening}</td><td>${h.Skor_Grammar}</td><td>${h.Skor_Reading}</td>
            <td><strong>${h.Skor_Total}</strong></td><td>${h.Status_Lulus === 'Lulus' ? '<span class="badge-pill badge-success"><span class="dot"></span>LULUS</span>' : '<span class="badge-pill badge-danger"><span class="dot"></span>TIDAK LULUS</span>'}</td></tr>
          `).join('') : `<tr><td colspan="7"><div class="empty-state"><i class="bi bi-clipboard-data"></i>Belum ada data hasil ujian.</div></td></tr>`;
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getGlobalReport(filterUjian || null);
    
      gasRun.withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
        if (res.success) document.getElementById('reportExamFilter').innerHTML = '<option value="">Semua Ujian</option>' + res.data.map(u => `<option value="${u.ID_Ujian}">${u.Nama_Ujian}</option>`).join('');
      }).getAllExamsAdmin();
    }
    
    // ════════════════════════════════════════════════════════
    // ADMIN — LOG AKTIVITAS
    // ════════════════════════════════════════════════════════
    function loadActivityLog() {
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Gagal terhubung ke Server CBT. Periksa koneksi internet Anda atau hubungi Administrator sistem.', 'danger'); return; }
          if (!res.success) return;
          document.getElementById('activityLogTableBody').innerHTML = res.data.length ? res.data.map(l => `
            <tr><td style="white-space:nowrap;">${formatDate(l.Timestamp)}</td><td><span class="badge-pill badge-indigo">${l.Peran}</span></td>
            <td>${l.Nama_User}</td><td>${l.Aksi}</td><td style="color:var(--text-muted);">${l.Detail || ''}</td></tr>`).join('')
            : `<tr><td colspan="5"><div class="empty-state"><i class="bi bi-journal-x"></i>Belum ada log.</div></td></tr>`;
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getActivityLog(100);
    }
    
    // ════════════════════════════════════════════════════════
    // ADMIN — PENGATURAN SISTEM KOMPREHENSIF (5 MODUL)
    // ════════════════════════════════════════════════════════
    function applyLoadedSettings(settings) {
      if (!settings) return;
      appState.systemSettings = settings;
      if (settings.institutionName) {
        const brandEls = document.querySelectorAll('.app-sidebar .brand .name');
        brandEls.forEach(el => el.textContent = settings.institutionName);
        const subEls = document.querySelectorAll('#staffPortalLabel');
        subEls.forEach(el => el.textContent = 'Portal ' + settings.institutionName);
      }
      if (settings.audioMaxPlays !== undefined) appState.audioMaxPlayLimit = Number(settings.audioMaxPlays) || 2;
      if (settings.cheatTolerance !== undefined) appState.maxCheatViolations = Number(settings.cheatTolerance);
      if (settings.cheatAction !== undefined) appState.cheatAction = settings.cheatAction;
      if (settings.enforceFullscreen !== undefined) appState.enforceFullscreen = settings.enforceFullscreen !== '0';
      if (settings.requireSoundCheck !== undefined) appState.requireSoundCheck = settings.requireSoundCheck !== '0';
      if (settings.releaseScore !== undefined) appState.releaseScore = settings.releaseScore;
      if (settings.showSectionBreakdown !== undefined) appState.showSectionBreakdown = settings.showSectionBreakdown !== '0';
      if (settings.scoringMode !== undefined) appState.scoringMode = settings.scoringMode;
      try {
        localStorage.setItem('cbt_system_settings', JSON.stringify(settings));
      } catch(e){}
    }

    function populateSettingsForm(data) {
      if (!data) return;
      const setVal = (id, val, def) => {
        const el = document.getElementById(id);
        if (el) el.value = (val !== undefined && val !== null && val !== '') ? val : def;
      };
      setVal('settingScoringMode', data.scoringMode, 'toefl_itp');
      setVal('settingPassing', data.passingScoreDefault, 500);
      setVal('settingDurasi', data.durasiDefault, 115);
      setVal('settingSkalaMin', data.skalaMin, 310);
      setVal('settingSkalaMax', data.skalaMax, 677);
      setVal('settingCheatTolerance', data.cheatTolerance, '3');
      setVal('settingCheatAction', data.cheatAction, 'auto_submit');
      setVal('settingEnforceFullscreen', data.enforceFullscreen, '1');
      setVal('settingAudioMaxPlays', data.audioMaxPlays, '2');
      setVal('settingRequireSoundCheck', data.requireSoundCheck, '1');
      setVal('settingReleaseScore', data.releaseScore, 'instant');
      setVal('settingShowSectionBreakdown', data.showSectionBreakdown, '1');
      setVal('settingInstitutionName', data.institutionName, '');
      setVal('settingCertValidityDays', data.certValidityDays, 730);
      setVal('settingDirectorName', data.directorName, '');
      setVal('settingDirectorNIP', data.directorNIP, '');
    }

    function loadSystemSettings() {
      // Muat instan dari memori lokal terlebih dahulu
      try {
        const cached = localStorage.getItem('cbt_system_settings');
        if (cached) populateSettingsForm(JSON.parse(cached));
      } catch(e){}

      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
          if (!res.success || !res.data) return;
          populateSettingsForm(res.data);
          applyLoadedSettings(res.data);
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .getSystemSettings();
    }

    function handleSaveSettings(e) {
      e.preventDefault();
      const skalaMin = Number(document.getElementById('settingSkalaMin').value);
      const skalaMax = Number(document.getElementById('settingSkalaMax').value);
      if (skalaMax <= skalaMin) { 
        showToast('Peringatan', 'Skala Nilai Maksimum harus lebih besar dari Skala Minimum.', 'warning'); 
        return; 
      }

      const settings = {
        scoringMode: document.getElementById('settingScoringMode').value,
        passingScoreDefault: document.getElementById('settingPassing').value,
        durasiDefault: document.getElementById('settingDurasi').value,
        skalaMin: skalaMin,
        skalaMax: skalaMax,
        cheatTolerance: document.getElementById('settingCheatTolerance').value,
        cheatAction: document.getElementById('settingCheatAction').value,
        enforceFullscreen: document.getElementById('settingEnforceFullscreen').value,
        audioMaxPlays: document.getElementById('settingAudioMaxPlays').value,
        requireSoundCheck: document.getElementById('settingRequireSoundCheck').value,
        releaseScore: document.getElementById('settingReleaseScore').value,
        showSectionBreakdown: document.getElementById('settingShowSectionBreakdown').value,
        institutionName: document.getElementById('settingInstitutionName').value.trim(),
        certValidityDays: document.getElementById('settingCertValidityDays').value,
        directorName: document.getElementById('settingDirectorName').value.trim(),
        directorNIP: document.getElementById('settingDirectorNIP').value.trim()
      };

      // Terapkan langsung ke lingkungan aplikasi aktif
      applyLoadedSettings(settings);

      gasRun
        .withSuccessHandler(res => {
          showToast(res.success ? 'Berhasil Disimpan' : 'Gagal', res.message || 'Seluruh parameter pengaturan sistem institusi berhasil diperbarui.', res.success ? 'success' : 'danger');
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .saveSystemSettings(settings);
    }
    
    // ════════════════════════════════════════════════════════
    // DIAGNOSTIK SISTEM
    // ════════════════════════════════════════════════════════
    function runDiagnostics() {
      const box = document.getElementById('diagnosticsResult');
      box.innerHTML = `<div class="skeleton" style="height:80px;"></div>`;
    
      gasRun
        .withSuccessHandler(res => {
          if (!res) {
            box.innerHTML = `<div style="background:var(--danger-bg);color:var(--danger-text);border-radius:var(--radius-input);padding:14px;font-size:13px;">
              <strong><i class="bi bi-wifi-off"></i> Tidak ada respons dari server API CBT.</strong><br>
              Server backend belum merespons permintaan. Pastikan koneksi internet aktif, project di Vercel dalam status Ready, dan database telah terhubung.
              Coba <strong>refresh halaman (Ctrl+Shift+R)</strong> untuk mencoba kembali.
            </div>`;
            return;
          }
          if (!res.success) {
            box.innerHTML = `<div style="background:var(--danger-bg);color:var(--danger-text);border-radius:var(--radius-input);padding:14px;font-size:13px;">Diagnostik gagal dijalankan: ${res.message}</div>`;
            return;
          }
          const d = res.data;
          const tableList = d.tables || d.sheets || [];
          const tableRows = tableList.map(s => `
            <tr>
              <td><code>${s.name}</code></td>
              <td>${s.exists ? '<span class="badge-pill badge-success"><span class="dot"></span>Tersedia</span>' : '<span class="badge-pill badge-danger"><span class="dot"></span>Belum Ada</span>'}</td>
              <td>${s.exists ? s.rowCount + ' baris data' : '-'}</td>
            </tr>`).join('');
    
          const ujianPreviewRows = (d.ujianPreview || []).map(u => `
            <tr>
              <td>${u.ID_Ujian || '<em style="color:var(--danger);">(kosong)</em>'}</td>
              <td>${u.Nama_Ujian || '<em style="color:var(--danger);">(kosong)</em>'}</td>
              <td><code>${u.ID_Dosen_Pembuat || '<span style="color:var(--danger);">(KOSONG!)</span>'}</code></td>
              <td>${u.Status || '<em style="color:var(--danger);">(kosong)</em>'}</td>
              <td style="font-size:11px;">${u.Tanggal_Buka || '-'}</td>
            </tr>`).join('');
    
          box.innerHTML = `
            <div style="background:${d.ok ? 'var(--success-bg)' : 'var(--warning-bg)'};color:${d.ok ? 'var(--success-text)' : 'var(--warning-text)'};border-radius:var(--radius-input);padding:14px;font-size:13px;margin-bottom:14px;">
              <strong><i class="bi ${d.ok ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}"></i> ${d.ok ? 'Sistem sehat — koneksi API & struktur tabel database PostgreSQL normal.' : 'Ditemukan masalah pada struktur tabel database.'}</strong>
            </div>
            <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px;">
              Mesin Database: <strong>${d.databaseType || 'PostgreSQL Relasional (Neon/Vercel)'}</strong><br>
              Status Koneksi: <span class="badge-pill badge-success" style="display:inline-flex;"><span class="dot"></span>Terhubung Aktif</span>
            </div>
            <div class="table-wrap"><table class="table-cbt">
              <thead><tr><th>Nama Tabel Relasional</th><th>Status Integritas</th><th>Total Baris Data</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table></div>
            ${d.errors.length ? `<div style="background:var(--danger-bg);color:var(--danger-text);border-radius:var(--radius-input);padding:12px;font-size:12.5px;margin-top:14px;"><strong>Detail Error:</strong><br>${d.errors.join('<br>')}</div>` : ''}
            ${ujianPreviewRows ? `
            <div style="margin-top:20px;font-weight:700;font-family:'Poppins';font-size:14px;">Data Tabel "Ujian" (Integritas Relasi Dosen & Ujian)</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Menampilkan verifikasi relasi penugasan dosen pembuat paket ujian aktif.</div>
            <div class="table-wrap"><table class="table-cbt">
              <thead><tr><th>ID Ujian</th><th>Nama Ujian</th><th>ID Dosen Pembuat</th><th>Status</th><th>Tanggal Buka</th></tr></thead>
              <tbody>${ujianPreviewRows}</tbody>
            </table></div>` : ''}
          `;
        })
        .withFailureHandler(err => {
          box.innerHTML = `<div style="background:var(--danger-bg);color:var(--danger-text);border-radius:var(--radius-input);padding:14px;font-size:13px;">Gagal terhubung ke server: ${err.message}</div>`;
        })
        .runDiagnostics();
    }
    
    // ════════════════════════════════════════════════════════
    // ITEM ANALYSIS — statistik tingkat kesulitan per butir soal
    // ════════════════════════════════════════════════════════
    function openItemAnalysis(idUjian, namaUjian) {
      if (!idUjian) { showToast('Peringatan', 'Pilih ujian terlebih dahulu.', 'warning'); return; }
      document.getElementById('itemAnalysisExamName').textContent = namaUjian || idUjian;
      navigateTo('itemAnalysis');
      const tbody = document.getElementById('itemAnalysisTableBody');
      const summaryBox = document.getElementById('itemAnalysisSummary');
      tbody.innerHTML = `<tr><td colspan="9"><div class="skeleton" style="height:40px;"></div></td></tr>`;
      summaryBox.innerHTML = '';
    
      gasRun
        .withSuccessHandler(res => {
          if (!res) { tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state" style="color:var(--danger);">Tidak ada respons dari server.</div></td></tr>`; return; }
          if (!res.success) { tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state" style="color:var(--danger);">${res.message}</div></td></tr>`; return; }
    
          const d = res.data;
          if (!d.items.length) {
            tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="bi bi-bar-chart"></i>Belum ada peserta yang menyelesaikan ujian ini, atau ujian belum memiliki soal.</div></td></tr>`;
            return;
          }
    
          const mudah = d.items.filter(i => i.tingkatKesulitan === 'Mudah').length;
          const sedang = d.items.filter(i => i.tingkatKesulitan === 'Sedang').length;
          const sulit = d.items.filter(i => i.tingkatKesulitan === 'Sulit').length;
          const dayaPembedaBaik = d.items.filter(i => (i.dayaPembedaVal || 0) >= 0.30).length;

          summaryBox.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;">
              ${statCard('bi-people', 'icon-bg-teal', d.totalPeserta, 'Total Peserta Dianalisis')}
              ${statCard('bi-emoji-smile', 'icon-bg-success', mudah, 'Soal Kategori Mudah')}
              ${statCard('bi-emoji-neutral', 'icon-bg-amber', sedang, 'Soal Kategori Sedang')}
              ${statCard('bi-emoji-frown', 'icon-bg-coral', sulit, 'Soal Kategori Sulit')}
              ${statCard('bi-check2-all', 'icon-bg-indigo', dayaPembedaBaik, 'Daya Pembeda Baik (D ≥ 0.30)')}
            </div>`;
    
          const difficultyBadge = { Mudah: 'badge-success', Sedang: 'badge-warning', Sulit: 'badge-danger' };
          tbody.innerHTML = d.items.map(it => {
            const dVal = it.dayaPembedaVal !== undefined ? it.dayaPembedaVal : 0;
            const dColor = dVal >= 0.40 ? 'var(--success)' : dVal >= 0.30 ? 'var(--primary)' : dVal >= 0.20 ? '#D97706' : 'var(--danger)';
            return `
            <tr>
              <td>${it.Nomor}</td>
              <td><span class="badge-pill badge-indigo">${it.Sesi}</span></td>
              <td style="max-width:320px;">${escapeHtml((it.Pertanyaan || '').substring(0, 80))}${(it.Pertanyaan || '').length > 80 ? '...' : ''}</td>
              <td><strong>${it.Jawaban_Benar}</strong></td>
              <td>${it.jumlahBenar}/${it.totalJawab}</td>
              <td><strong>${it.persentaseBenar}%</strong></td>
              <td><span class="badge-pill ${difficultyBadge[it.tingkatKesulitan]}"><span class="dot"></span>${it.tingkatKesulitan}</span></td>
              <td>
                <span style="font-weight:700;color:${dColor};">${dVal}</span>
                <div style="font-size:10.5px;color:var(--text-muted);">${it.dayaPembedaKategori || '-'}</div>
              </td>
              <td style="font-size:11.5px;">A:${it.distribusi.A} · B:${it.distribusi.B} · C:${it.distribusi.C} · D:${it.distribusi.D} · Kosong:${it.distribusi.Kosong}</td>
            </tr>`;
          }).join('');
        })
        .withFailureHandler(err => { tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state" style="color:var(--danger);">${err.message}</div></td></tr>`; })
        .getItemAnalysis(idUjian);
    }
    
    // ════════════════════════════════════════════════════════
    // BANK SOAL TERPUSAT
    // ════════════════════════════════════════════════════════
    function initBankSoalPage() {
      // isi dropdown Topik dari daftar topik yang sudah pernah dipakai
      gasRun.withSuccessHandler(res => {
        if (!res || !res.success) return;
        const options = '<option value="">Semua Topik</option>' + res.data.map(t => `<option value="${t}">${t}</option>`).join('');
        document.getElementById('bankFilterTopik').innerHTML = options;
      }).getBankSoalTopics();
      loadBankSoalTable();
    }
    
    function loadBankSoalTable() {
      const filters = {
        sesi: document.getElementById('bankFilterSesi').value,
        topik: document.getElementById('bankFilterTopik').value,
        level: document.getElementById('bankFilterLevel').value
      };
      const tbody = document.getElementById('bankSoalTableBody');
      tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:40px;"></div></td></tr>`;
    
      gasRun
        .withSuccessHandler(res => {
          if (!res) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);">Tidak ada respons dari server.</div></td></tr>`; return; }
          if (!res.success) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);">${res.message}</div></td></tr>`; return; }
          window._bankSoalCache = res.data;
          const levelBadge = { Mudah: 'badge-success', Sedang: 'badge-warning', Sulit: 'badge-danger' };
          tbody.innerHTML = res.data.length ? res.data.map(b => `
            <tr>
              <td><span class="badge-pill badge-indigo">${b.Sesi}</span></td>
              <td>${b.Topik || 'Umum'}</td>
              <td><span class="badge-pill ${levelBadge[b.Level_Kesulitan] || 'badge-neutral'}"><span class="dot"></span>${b.Level_Kesulitan || 'Sedang'}</span></td>
              <td style="max-width:340px;">${(b.Pertanyaan || '').substring(0, 80)}${(b.Pertanyaan || '').length > 80 ? '...' : ''}</td>
              <td><strong>${b.Jawaban_Benar}</strong></td>
              <td>
                <button class="btn-icon-sm" title="Edit" onclick="openBankSoalFormModal('${b.ID_Bank}')"><i class="bi bi-pencil"></i></button>
                <button class="btn-icon-sm" title="Hapus" onclick="deleteBankSoalRow('${b.ID_Bank}')"><i class="bi bi-trash" style="color:var(--danger);"></i></button>
              </td>
            </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-collection"></i>Belum ada soal di Bank Soal. Tambah manual atau import CSV.</div></td></tr>`;
        })
        .withFailureHandler(err => { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state" style="color:var(--danger);">${err.message}</div></td></tr>`; })
        .getBankSoalList(filters);
    }
    
    function toggleBankAudioFieldVisibility() {
      document.getElementById('bfAudioWrap').style.display = document.getElementById('bfSesi').value === 'Listening' ? '' : 'none';
    }
    
    function openBankSoalFormModal(idBank) {
      document.getElementById('bfAudioUploadStatus').textContent = '';
      if (idBank) {
        const b = (window._bankSoalCache || []).find(x => x.ID_Bank === idBank);
        if (!b) return;
        document.getElementById('bankSoalFormTitle').innerHTML = '<i class="bi bi-pencil-square"></i> Edit Soal Bank';
        document.getElementById('bfIdBank').value = b.ID_Bank;
        document.getElementById('bfSesi').value = ['Listening','Structure','Reading'].includes(b.Sesi) ? b.Sesi : 'Listening';
        document.getElementById('bfLevel').value = b.Level_Kesulitan || 'Sedang';
        document.getElementById('bfTopik').value = b.Topik || '';
        document.getElementById('bfPoin').value = b.Poin || 1;
        document.getElementById('bfPertanyaan').value = b.Pertanyaan || '';
        document.getElementById('bfPassage').value = b.Passage_Teks || '';
        document.getElementById('bfLinkAudio').value = b.Link_Audio || '';
        document.getElementById('bfPilihanA').value = b.Pilihan_A || '';
        document.getElementById('bfPilihanB').value = b.Pilihan_B || '';
        document.getElementById('bfPilihanC').value = b.Pilihan_C || '';
        document.getElementById('bfPilihanD').value = b.Pilihan_D || '';
        document.getElementById('bfJawabanBenar').value = b.Jawaban_Benar || 'A';
      } else {
        document.getElementById('bankSoalFormTitle').innerHTML = '<i class="bi bi-plus-circle"></i> Tambah ke Bank Soal';
        document.getElementById('bfIdBank').value = '';
        document.getElementById('bfSesi').value = 'Listening';
        document.getElementById('bfLevel').value = 'Sedang';
        document.getElementById('bfPoin').value = 1;
        ['bfTopik','bfPertanyaan','bfPassage','bfLinkAudio','bfPilihanA','bfPilihanB','bfPilihanC','bfPilihanD'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('bfJawabanBenar').value = 'A';
      }
      toggleBankAudioFieldVisibility();
      openModal('modalBankSoalForm');
    }
    
    function handleBfAudioSelected(event) {
      const file = event.target.files[0];
      if (!file) return;
      const statusEl = document.getElementById('bfAudioUploadStatus');
      statusEl.textContent = 'Mengupload audio...';
      fileToBase64(file).then(base64 => {
        gasRun
          .withSuccessHandler(res => {
            if (!res) { statusEl.textContent = ''; showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
            if (!res.success) { statusEl.textContent = ''; showToast('Gagal', res.message, 'danger'); return; }
            document.getElementById('bfLinkAudio').value = res.data.fileUrl;
            statusEl.textContent = '✅ Audio berhasil diupload & link terisi otomatis.';
          })
          .withFailureHandler(err => { statusEl.textContent = ''; showToast('Error', err.message, 'danger'); })
          .uploadAudioToDrive(base64, file.name, file.type || 'audio/mpeg');
      }).catch(() => showToast('Error', 'Gagal membaca file audio.', 'danger'));
    }
    
    function submitBankSoalForm() {
      const idBank = document.getElementById('bfIdBank').value;
      const soalObj = {
        ID_Bank: idBank || undefined,
        Sesi: document.getElementById('bfSesi').value,
        Topik: document.getElementById('bfTopik').value.trim() || 'Umum',
        Level_Kesulitan: document.getElementById('bfLevel').value,
        Pertanyaan: document.getElementById('bfPertanyaan').value.trim(),
        Passage_Teks: document.getElementById('bfPassage').value.trim(),
        Link_Audio: document.getElementById('bfLinkAudio').value.trim(),
        Pilihan_A: document.getElementById('bfPilihanA').value.trim(),
        Pilihan_B: document.getElementById('bfPilihanB').value.trim(),
        Pilihan_C: document.getElementById('bfPilihanC').value.trim(),
        Pilihan_D: document.getElementById('bfPilihanD').value.trim(),
        Jawaban_Benar: document.getElementById('bfJawabanBenar').value,
        Poin: Number(document.getElementById('bfPoin').value) || 1
      };
      if (!soalObj.Pertanyaan || !soalObj.Pilihan_A || !soalObj.Pilihan_B) {
        showToast('Peringatan', 'Pertanyaan, Pilihan A, dan Pilihan B wajib diisi.', 'warning');
        return;
      }
      const idOwner = appState.staff.role === 'admin' ? 'ADMIN' : appState.staff.ID_Dosen;
      const handler = res => {
        if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
        if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
        showToast('Berhasil', res.message, 'success');
        closeModal('modalBankSoalForm');
        initBankSoalPage();
      };
      if (idBank) {
        gasRun.withSuccessHandler(handler).withFailureHandler(err => showToast('Error', err.message, 'danger')).updateBankSoal(soalObj);
      } else {
        gasRun.withSuccessHandler(handler).withFailureHandler(err => showToast('Error', err.message, 'danger')).addBankSoal(soalObj, idOwner);
      }
    }
    
    function deleteBankSoalRow(idBank) {
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
          showToast(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'danger');
          loadBankSoalTable();
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .deleteBankSoal(idBank);
    }
    
    function downloadBankCsvTemplate() {
      const headers = 'Sesi,Topik,Level_Kesulitan,Pertanyaan,Passage_Teks,Link_Audio,Pilihan_A,Pilihan_B,Pilihan_C,Pilihan_D,Jawaban_Benar,Poin';
      const example = 'Structure,Tenses,Sedang,"She ___ to school every day.","","","goes","go","going","gone",A,1';
      const blob = new Blob([headers + '\n' + example], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'template_bank_soal.csv';
      link.click();
    }
    
    function openImportBankCsvModal() {
      document.getElementById('bankCsvFileName').textContent = '';
      document.getElementById('bankCsvValidationResult').innerHTML = '';
      openModal('modalImportBankCsv');
    }
    
    let selectedBankCsvFile = null;
    function handleBankCsvSelected(event) {
      selectedBankCsvFile = event.target.files[0];
      if (selectedBankCsvFile) document.getElementById('bankCsvFileName').textContent = '📄 ' + selectedBankCsvFile.name;
    }
    
    let parsedBankCsvQuestions = [];
    function validateAndPreviewBankCsv() {
      if (!selectedBankCsvFile) { showToast('Peringatan', 'Pilih file CSV terlebih dahulu.', 'warning'); return; }
      Papa.parse(selectedBankCsvFile, {
        header: true, skipEmptyLines: true, encoding: 'UTF-8',
        complete: function(results) {
          parsedBankCsvQuestions = results.data;
          const errors = [];
          results.data.forEach((row, i) => {
            if (!row.Sesi || !row.Pertanyaan || !row.Jawaban_Benar) errors.push({ row: i + 1, msg: 'Kolom wajib kosong.' });
            else if (!['A','B','C','D'].includes(String(row.Jawaban_Benar).toUpperCase())) errors.push({ row: i + 1, msg: 'Jawaban_Benar harus A/B/C/D.' });
          });
          const validCount = results.data.length - errors.length;
          document.getElementById('bankCsvValidationResult').innerHTML = `
            <div style="display:flex;gap:12px;margin-bottom:12px;">
              <span class="badge-pill badge-success"><span class="dot"></span>${validCount} Baris Valid</span>
              ${errors.length ? `<span class="badge-pill badge-danger"><span class="dot"></span>${errors.length} Baris Bermasalah</span>` : ''}
            </div>
            <div style="text-align:right;">
              <button class="btn-cbt btn-cbt-primary" ${errors.length ? 'disabled' : ''} onclick="confirmImportBankCsv()"><i class="bi bi-upload"></i> Konfirmasi Impor (${validCount} Butir)</button>
            </div>`;
        }
      });
    }
    
    function confirmImportBankCsv() {
      const idOwner = appState.staff.role === 'admin' ? 'ADMIN' : appState.staff.ID_Dosen;
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
          if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
          showToast('Berhasil', `${res.data.success} soal berhasil ditambahkan ke Bank Soal.`, 'success');
          closeModal('modalImportBankCsv');
          initBankSoalPage();
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .importBankSoalBatch(parsedBankCsvQuestions, idOwner);
    }
    
    // ════════════════════════════════════════════════════════
    // TARIK SOAL DARI BANK SOAL KE UJIAN (Manual / Acak)
    // ════════════════════════════════════════════════════════
    function openPullFromBankModal() {
      if (!window._manageQuestionsExamId) { showToast('Peringatan', 'Buka halaman Kelola Soal untuk ujian tertentu terlebih dahulu.', 'warning'); return; }
      switchPullTab('random');
      gasRun.withSuccessHandler(res => {
        if (!res || !res.success) return;
        document.getElementById('prTopik').innerHTML = '<option value="">Semua Topik</option>' + res.data.map(t => `<option value="${t}">${t}</option>`).join('');
      }).getBankSoalTopics();
      openModal('modalPullFromBank');
    }
    
    function switchPullTab(tab) {
      document.getElementById('pullTabRandom').classList.toggle('active', tab === 'random');
      document.getElementById('pullTabManual').classList.toggle('active', tab === 'manual');
      document.getElementById('pullRandomPanel').style.display = tab === 'random' ? '' : 'none';
      document.getElementById('pullManualPanel').style.display = tab === 'manual' ? '' : 'none';
      window._pullActiveTab = tab;
      if (tab === 'manual') loadManualBankPicker();
    }
    
    function loadManualBankPicker() {
      const sesi = document.getElementById('pmSesiFilter').value;
      const listEl = document.getElementById('manualBankPickerList');
      listEl.innerHTML = `<div class="skeleton" style="height:40px;"></div>`;
      gasRun
        .withSuccessHandler(res => {
          if (!res || !res.success) { listEl.innerHTML = `<div class="empty-state" style="color:var(--danger);">Gagal memuat Bank Soal.</div>`; return; }
          window._pullManualCache = res.data;
          listEl.innerHTML = res.data.length ? res.data.map(b => `
            <label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border-bottom:1px solid var(--border-color);cursor:pointer;">
              <input type="checkbox" class="pull-manual-checkbox" value="${b.ID_Bank}" style="margin-top:3px;">
              <div>
                <span class="badge-pill badge-indigo" style="margin-right:6px;">${b.Sesi}</span>
                <span style="font-size:11.5px;color:var(--text-muted);">${b.Topik || 'Umum'} · ${b.Level_Kesulitan || 'Sedang'}</span>
                <div style="font-size:13px;margin-top:4px;">${(b.Pertanyaan || '').substring(0, 100)}</div>
              </div>
            </label>`).join('') : `<div class="empty-state">Tidak ada soal di Bank Soal untuk filter ini.</div>`;
        })
        .withFailureHandler(err => { listEl.innerHTML = `<div class="empty-state" style="color:var(--danger);">${err.message}</div>`; })
        .getBankSoalList(sesi ? { sesi } : {});
    }
    
    function submitPullFromBank() {
      const idUjian = window._manageQuestionsExamId;
      if (window._pullActiveTab === 'manual') {
        const checked = Array.from(document.querySelectorAll('.pull-manual-checkbox:checked')).map(c => c.value);
        if (!checked.length) { showToast('Peringatan', 'Pilih minimal satu soal.', 'warning'); return; }
        gasRun
          .withSuccessHandler(res => {
            if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
            if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
            showToast('Berhasil', res.message, 'success');
            closeModal('modalPullFromBank');
            loadManageQuestionsTable(idUjian);
          })
          .withFailureHandler(err => showToast('Error', err.message, 'danger'))
          .pullFromBankToExam(idUjian, checked);
      } else {
        const criteria = {
          sesi: document.getElementById('prSesi').value,
          topik: document.getElementById('prTopik').value,
          level: document.getElementById('prLevel').value,
          jumlah: Number(document.getElementById('prJumlah').value) || 0
        };
        if (criteria.jumlah <= 0) { showToast('Peringatan', 'Jumlah soal harus lebih dari 0.', 'warning'); return; }
        gasRun
          .withSuccessHandler(res => {
            if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
            if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
            showToast('Berhasil', res.message, 'success');
            closeModal('modalPullFromBank');
            loadManageQuestionsTable(idUjian);
          })
          .withFailureHandler(err => showToast('Error', err.message, 'danger'))
          .pullRandomFromBank(idUjian, criteria);
      }
    }
    
    // ════════════════════════════════════════════════════════
    // PERBANDINGAN PERFORMA ANTAR ROMBEL
    // ════════════════════════════════════════════════════════
    function initRombelComparisonPage() {
      gasRun.withSuccessHandler(res => {
        if (!res || !res.success) return;
        document.getElementById('rombelExamFilter').innerHTML = '<option value="">Semua Ujian</option>' +
          res.data.map(u => `<option value="${u.ID_Ujian}">${u.Nama_Ujian}</option>`).join('');
      }).getAllExamsAdmin();
      loadRombelComparison();
    }

    function loadRombelComparison() {
      const idUjian = document.getElementById('rombelExamFilter').value;
      const tbody = document.getElementById('rombelComparisonTableBody');
      const statContainer = document.getElementById('rombelStatCards');
      const badgeCount = document.getElementById('rombelCountBadge');
      const infoLabel = document.getElementById('rombelFilterInfo');

      tbody.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height:48px;"></div></td></tr>';

      gasRun
        .withSuccessHandler(res => {
          if (!res) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state" style="color:var(--danger);">Tidak ada respons dari server.</div></td></tr>';
            return;
          }
          if (!res.success) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state" style="color:var(--danger);">' + escapeHtml(res.message) + '</div></td></tr>';
            return;
          }

          const rawData = res.data || [];
          if (!rawData.length) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state" style="padding:32px 0;"><i class="bi bi-bar-chart"></i>Belum ada data hasil ujian untuk rombel yang dipilih.</div></td></tr>';
            if (statContainer) statContainer.innerHTML = '';
            if (badgeCount) badgeCount.textContent = '0 Rombel';
            renderRombelDualCharts([], [], []);
            return;
          }

          // Urutkan data berdasarkan Rata-rata Skor tertinggi (Leaderboard Ranking)
          const data = rawData.slice().sort((a, b) => (Number(b.rataRata) || 0) - (Number(a.rataRata) || 0));

          // Hitung Metrik Ringkasan (KPI Cards)
          const totalRombel = data.length;
          const totalPesertaAll = data.reduce((acc, r) => acc + (Number(r.totalPeserta) || 0), 0);
          const topBatch = data[0];
          const totalWeightScore = data.reduce((acc, r) => acc + ((Number(r.rataRata) || 0) * (Number(r.totalPeserta) || 0)), 0);
          const avgOverall = totalPesertaAll > 0 ? Math.round(totalWeightScore / totalPesertaAll) : 0;

          if (badgeCount) {
            badgeCount.innerHTML = '<i class="bi bi-collection"></i> ' + totalRombel + ' Rombel Teranalisis';
          }
          if (infoLabel) {
            infoLabel.textContent = idUjian ? 'Menampilkan data untuk ujian terpilih' : 'Menampilkan metrik agregasi seluruh rombel';
          }

          if (statContainer) {
            statContainer.innerHTML =
              statCard('bi-collection-fill', 'icon-bg-teal', totalRombel, 'Total Rombel', '<i class="bi bi-layers"></i> Kelompok batch aktif') +
              statCard('bi-people-fill', 'icon-bg-indigo', totalPesertaAll, 'Total Peserta', '<i class="bi bi-person-check"></i> Peserta selesai ujian') +
              statCard('bi-trophy-fill', 'icon-bg-amber', topBatch ? escapeHtml(topBatch.rombel) : '-', 'Batch Terbaik (#1)', '<i class="bi bi-award"></i> Skor: ' + (topBatch ? topBatch.rataRata : 0)) +
              statCard('bi-graph-up-arrow', 'icon-bg-coral', avgOverall, 'Rata-rata Keseluruhan', '<i class="bi bi-speedometer2"></i> Skala TOEFL Institusi');
          }

          // Render Tabel Leaderboard Rombel
          tbody.innerHTML = data.map((r, idx) => {
            let rankBadge = '<span class="badge-rank rank-normal">' + (idx + 1) + '</span>';
            if (idx === 0) rankBadge = '<span class="badge-rank rank-gold" title="Peringkat 1">🥇 1</span>';
            else if (idx === 1) rankBadge = '<span class="badge-rank rank-silver" title="Peringkat 2">🥈 2</span>';
            else if (idx === 2) rankBadge = '<span class="badge-rank rank-bronze" title="Peringkat 3">🥉 3</span>';

            const passingPct = Number(r.tingkatKelulusan) || 0;
            const barColor = passingPct >= 75 ? '#10B981' : (passingPct >= 50 ? '#0D9488' : '#F59E0B');

            return `
              <tr>
                <td style="text-align:center;">${rankBadge}</td>
                <td>
                  <div style="font-weight:700;color:var(--text-heading);font-size:13.5px;">${escapeHtml(r.rombel)}</div>
                </td>
                <td style="text-align:center;">
                  <span class="badge-pill badge-neutral" style="font-size:12px;"><i class="bi bi-person"></i> ${r.totalPeserta}</span>
                </td>
                <td style="text-align:center;">
                  <span style="font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:var(--primary);">${r.rataRata}</span>
                </td>
                <td style="text-align:center;">
                  <span style="font-size:12.5px;color:var(--text-muted);font-weight:500;">${r.terendah} — ${r.tertinggi}</span>
                </td>
                <td style="text-align:center;">
                  <span class="badge-pill badge-success" style="font-size:11px;" title="Jumlah Lulus"><i class="bi bi-check-circle"></i> ${r.lulus} Lulus</span>
                  <span class="badge-pill badge-danger" style="font-size:11px;margin-left:4px;" title="Jumlah Tidak Lulus"><i class="bi bi-x-circle"></i> ${r.tidakLulus}</span>
                </td>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="flex:1;background:rgba(226,232,240,0.8);border-radius:999px;height:8px;overflow:hidden;">
                      <div style="width:${Math.min(passingPct, 100)}%;background:${barColor};height:100%;border-radius:999px;transition:width .4s ease;"></div>
                    </div>
                    <span style="font-size:12px;font-weight:700;color:var(--text-heading);width:45px;text-align:right;">${passingPct}%</span>
                  </div>
                </td>
              </tr>`;
          }).join('');

          // Render Dual Charts: Skor & Kelulusan
          renderRombelDualCharts(data.map(r => r.rombel), data.map(r => Number(r.rataRata) || 0), data.map(r => Number(r.tingkatKelulusan) || 0));
        })
        .withFailureHandler(err => {
          tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state" style="color:var(--danger);">' + escapeHtml(err.message) + '</div></td></tr>';
        })
        .getRombelComparison(idUjian || null);
    }

    function renderRombelDualCharts(labels, scores, passingRates) {
      // 1. Chart Rata-rata Skor per Rombel
      const ctxSkor = document.getElementById('chartRombelComparison');
      if (ctxSkor) {
        if (appState.chartInstances.rombel) appState.chartInstances.rombel.destroy();
        
        const palette = ['#0D9488', '#2563EB', '#F59E0B', '#7C3AED', '#EC4899', '#10B981', '#06B6D4'];
        const barColors = labels.map((_, i) => palette[i % palette.length]);

        appState.chartInstances.rombel = new Chart(ctxSkor, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Rata-rata Skor',
              data: scores,
              backgroundColor: barColors,
              borderRadius: 6,
              borderSkipped: false,
              maxBarThickness: 32
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                titleFont: { family: 'Poppins', size: 12, weight: '600' },
                bodyFont: { family: 'Inter', size: 11.5 },
                padding: 9,
                cornerRadius: 7,
                callbacks: {
                  label: ctx => ' Rata-rata: ' + ctx.raw + ' (Skala TOEFL)'
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#334155', font: { family: 'Inter', size: 11, weight: '600' } }
              },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(226, 232, 240, 0.7)' },
                ticks: { color: '#64748B', font: { family: 'Inter', size: 11 } }
              }
            }
          }
        });
      }

      // 2. Chart Tingkat Kelulusan per Rombel (Horizontal Bar Chart)
      const ctxLulus = document.getElementById('chartRombelPassingRate');
      if (ctxLulus) {
        if (appState.chartInstances.rombelLulus) appState.chartInstances.rombelLulus.destroy();

        appState.chartInstances.rombelLulus = new Chart(ctxLulus, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Kelulusan (%)',
              data: passingRates,
              backgroundColor: passingRates.map(p => p >= 75 ? '#10B981' : (p >= 50 ? '#0D9488' : '#F59E0B')),
              borderRadius: 6,
              borderSkipped: false,
              maxBarThickness: 24
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                titleFont: { family: 'Poppins', size: 12, weight: '600' },
                bodyFont: { family: 'Inter', size: 11.5 },
                padding: 9,
                cornerRadius: 7,
                callbacks: {
                  label: ctx => ' Kelulusan: ' + ctx.raw + '%'
                }
              }
            },
            scales: {
              x: {
                min: 0,
                max: 100,
                grid: { color: 'rgba(226, 232, 240, 0.7)' },
                ticks: {
                  callback: val => val + '%',
                  color: '#64748B',
                  font: { family: 'Inter', size: 10.5 }
                }
              },
              y: {
                grid: { display: false },
                ticks: { color: '#334155', font: { family: 'Inter', size: 11, weight: '600' } }
              }
            }
          }
        });
      }
    }


    // ════════════════════════════════════════════════════════
    // IMPORT PESERTA MASSAL VIA CSV
    // ════════════════════════════════════════════════════════
    function openImportParticipantsModal() {
      document.getElementById('pesertaCsvFileName').textContent = '';
      document.getElementById('pesertaCsvValidationResult').innerHTML = '';
      gasRun.withSuccessHandler(res => {
        if (!res || !res.success) return;
        document.getElementById('importPesertaExamSelect').innerHTML = res.data.map(u => `<option value="${u.ID_Ujian}">${u.Nama_Ujian}</option>`).join('');
      }).getAllExamsAdmin();
      openModal('modalImportParticipants');
    }
    
    function downloadPesertaCsvTemplate() {
      const headers = 'Nama,Kontak,Rombel,Kode_Akses';
      const example = 'Budi Santoso,budi@mail.com,Rombel A,';
      const blob = new Blob([headers + '\n' + example], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'template_import_peserta.csv';
      link.click();
    }
    
    let selectedPesertaCsvFile = null;
    function handlePesertaCsvSelected(event) {
      selectedPesertaCsvFile = event.target.files[0];
      if (selectedPesertaCsvFile) document.getElementById('pesertaCsvFileName').textContent = '📄 ' + selectedPesertaCsvFile.name;
    }
    
    let parsedPesertaCsv = [];
    function validateAndPreviewPesertaCsv() {
      if (!selectedPesertaCsvFile) { showToast('Peringatan', 'Pilih file CSV terlebih dahulu.', 'warning'); return; }
      Papa.parse(selectedPesertaCsvFile, {
        header: true, skipEmptyLines: true, encoding: 'UTF-8',
        complete: function(results) {
          parsedPesertaCsv = results.data;
          const errors = [];
          results.data.forEach((row, i) => { if (!row.Nama || !row.Nama.trim()) errors.push({ row: i + 1, msg: 'Kolom Nama wajib diisi.' }); });
          const validCount = results.data.length - errors.length;
          document.getElementById('pesertaCsvValidationResult').innerHTML = `
            <div style="display:flex;gap:12px;margin-bottom:12px;">
              <span class="badge-pill badge-success"><span class="dot"></span>${validCount} Baris Valid</span>
              ${errors.length ? `<span class="badge-pill badge-danger"><span class="dot"></span>${errors.length} Baris Bermasalah</span>` : ''}
            </div>
            <div style="text-align:right;">
              <button class="btn-cbt btn-cbt-primary" ${errors.length ? 'disabled' : ''} onclick="confirmImportPesertaCsv()"><i class="bi bi-upload"></i> Konfirmasi Impor (${validCount} Peserta)</button>
            </div>`;
        }
      });
    }
    
    function confirmImportPesertaCsv() {
      const idUjian = document.getElementById('importPesertaExamSelect').value;
      gasRun
        .withSuccessHandler(res => {
          if (!res) { showToast('Koneksi Terputus', 'Tidak ada respons dari server.', 'danger'); return; }
          if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
          showToast('Berhasil', `${res.data.success} peserta berhasil diimpor.`, 'success');
          closeModal('modalImportParticipants');
          loadParticipants();
        })
        .withFailureHandler(err => showToast('Error', err.message, 'danger'))
        .importParticipantsBatch(idUjian, parsedPesertaCsv, 'LANG');
    }
