import React, { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Truck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ApiError, apiRequest } from '../lib/api';
import type { LoginFieldErrors, LoginFormState, LoginResponse } from './login/types';

const ACCESS_TOKEN_KEY = 'eco_access_token';
const REFRESH_TOKEN_KEY = 'eco_refresh_token';
const USER_PROFILE_KEY = 'eco_user_profile';

const initialFormState: LoginFormState = {
  identifier: '',
  password: '',
  rememberMe: true,
};

const getRoleRedirectPath = (roleMask: number) => {
  if ((roleMask & (32 | 64)) !== 0) return '/warehouse/inventory';
  if ((roleMask & 16) !== 0) return '/finance/hub-reconciliation';
  if ((roleMask & 8) !== 0) return '/trips';
  if ((roleMask & 4) !== 0) return '/nhiem-vu-giao-hang';
  if ((roleMask & 2) !== 0) return '/warehouse/manifests';
  if ((roleMask & 1) !== 0) return '/warehouse/orders/new';
  return '/warehouse';
};

const getStorage = (rememberMe: boolean) => (rememberMe ? localStorage : sessionStorage);

const clearOtherStorage = (rememberMe: boolean) => {
  const storage = rememberMe ? sessionStorage : localStorage;
  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
  storage.removeItem(USER_PROFILE_KEY);
};

const getSafeRedirectPath = (search: string) => {
  const redirect = new URLSearchParams(search).get('redirect');
  if (!redirect?.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/login')) return null;
  return redirect;
};

const mapLoginError = (error: unknown) => {
  if (error instanceof TypeError) {
    return 'Server không phản hồi. Vui lòng kiểm tra kết nối hoặc thử lại sau.';
  }

  if (error instanceof ApiError) {
    if (error.status === 401) return 'Email/mã nhân viên hoặc mật khẩu không đúng.';
    if (error.status === 403) return 'Tài khoản đang bị khóa hoặc chưa được cấp quyền truy cập.';
    if (error.status >= 500) return 'Server đang gặp sự cố. Vui lòng thử lại sau.';
    return error.message;
  }

  return 'Không thể đăng nhập. Vui lòng thử lại.';
};

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [formState, setFormState] = useState<LoginFormState>(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const trimmedIdentifier = useMemo(() => formState.identifier.trim(), [formState.identifier]);

  const setFormField = <K extends keyof LoginFormState>(key: K, value: LoginFormState[K]) => {
    setFormState(prev => ({ ...prev, [key]: value }));
    setSubmitError('');
    setFieldErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const validateForm = () => {
    const nextErrors: LoginFieldErrors = {};

    if (!trimmedIdentifier) nextErrors.identifier = 'Vui lòng nhập email hoặc mã nhân viên.';
    if (!formState.password) nextErrors.password = 'Vui lòng nhập mật khẩu.';
    if (formState.password && formState.password.length < 8) nextErrors.password = 'Mật khẩu tối thiểu 8 ký tự.';

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: {
          email: trimmedIdentifier,
          password: formState.password,
        },
      });

      const storage = getStorage(formState.rememberMe);
      clearOtherStorage(formState.rememberMe);
      storage.setItem(ACCESS_TOKEN_KEY, response.access_token);
      storage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
      storage.setItem(USER_PROFILE_KEY, JSON.stringify(response.user));

      navigate(getSafeRedirectPath(location.search) ?? getRoleRedirectPath(response.user.role_mask), { replace: true });
    } catch (error) {
      setSubmitError(mapLoginError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background animate-in fade-in duration-500">
      <div className="grid min-h-screen w-full grid-cols-1 overflow-hidden bg-card lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-blue-800 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.38),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(14,165,233,0.24),transparent_28%)]" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 shadow-lg ring-1 ring-white/15 backdrop-blur">
              <Truck size={26} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-blue-100/80">ECO Transport</p>
              <h1 className="text-2xl font-black tracking-tight">Control Tower</h1>
            </div>
          </div>

          <div className="relative z-10 max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] font-bold text-blue-50 backdrop-blur">
              <ShieldCheck size={14} />
              Public route · bảo mật bằng phiên đăng nhập
            </div>
            <h2 className="text-4xl font-black leading-tight tracking-tight xl:text-5xl">
              Đăng nhập để điều phối toàn bộ luồng vận tải.
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-blue-50/78">
              Truy cập kho, giao hàng, chuyến xe và đối soát theo đúng quyền hạn của nhân sự tại bưu cục HAN/HCM.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-3 text-[12px] text-blue-50/80">
            {['Kho vận', 'Chuyến xe', 'Đối soát'].map(label => (
              <div key={label} className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur">
                <div className="mb-2 h-1 w-8 rounded-full bg-blue-300" />
                <span className="font-bold">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center bg-background/40 p-5 sm:p-8 lg:p-12">
          <div className="w-full max-w-[460px]">
            <div className="mb-8 text-center lg:text-left">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[22px] bg-primary text-primary-foreground shadow-md shadow-primary/20 lg:mx-0">
                <LockKeyhole size={26} />
              </div>
              <p className="text-[12px] font-bold uppercase tracking-[0.24em] text-primary">Đăng nhập nhân sự</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">Chào mừng trở lại</h2>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                Nhập email hoặc mã nhân viên để truy cập ECO Transport System v2.0.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="identifier" className="mb-2 block text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                  Email / mã nhân viên
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
                  <input
                    id="identifier"
                    type="text"
                    value={formState.identifier}
                    onChange={(event) => setFormField('identifier', event.target.value)}
                    autoComplete="username"
                    className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-[14px] font-medium text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="name@eco.vn hoặc ECO001"
                    aria-invalid={Boolean(fieldErrors.identifier)}
                  />
                </div>
                {fieldErrors.identifier && <p className="mt-2 text-[12px] font-medium text-red-600">{fieldErrors.identifier}</p>}
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                  Mật khẩu
                </label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formState.password}
                    onChange={(event) => setFormField('password', event.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-12 text-[14px] font-medium text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Nhập mật khẩu"
                    aria-invalid={Boolean(fieldErrors.password)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {fieldErrors.password && <p className="mt-2 text-[12px] font-medium text-red-600">{fieldErrors.password}</p>}
              </div>

              <div className="flex items-center justify-between gap-3 py-1">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={formState.rememberMe}
                    onChange={(event) => setFormField('rememberMe', event.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary accent-primary"
                  />
                  Ghi nhớ đăng nhập
                </label>
                <span className="text-[12px] font-semibold text-muted-foreground">Public route</span>
              </div>

              {submitError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
                  <AlertCircle className="mt-0.5 shrink-0" size={16} />
                  <span>{submitError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-[14px] font-bold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {isSubmitting ? 'Đang xác thực...' : 'Đăng nhập'}
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
