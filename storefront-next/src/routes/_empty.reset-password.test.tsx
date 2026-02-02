/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub, type LoaderFunctionArgs, type ActionFunctionArgs } from 'react-router';
import ResetPassword, { loader, action } from './_empty.reset-password';
import { resetPasswordWithToken } from '@/middlewares/auth.server';
import { isPasswordValid } from '@/lib/utils';
import { getTranslation } from '@/lib/i18next';

const { t } = getTranslation();

// Mock the auth middleware
vi.mock('@/middlewares/auth.server', () => ({
    resetPasswordWithToken: vi.fn(),
}));

// Mock utils
vi.mock('@/lib/utils', async () => {
    const actual = await vi.importActual('@/lib/utils');
    return {
        ...actual,
        isPasswordValid: vi.fn(),
    };
});

// Mock PasswordRequirement component to avoid needing to deal with its complexity
vi.mock('@/components/password-requirements', () => ({
    PasswordRequirement: () => null,
}));

// Helper to render with createRoutesStub (provides full data router context for Form/Link components)
const renderWithRoutesStub = (loaderData: { token: string; email: string }) => {
    // Wrap the component to pass loaderData as a prop
    const WrappedComponent = () => <ResetPassword loaderData={loaderData} />;
    const Stub = createRoutesStub([
        {
            path: '/',
            Component: WrappedComponent,
        },
    ]);
    return render(<Stub initialEntries={['/']} />);
};

// Helper to render with createRoutesStub and real action for full-flow tests
const renderWithAction = (loaderData: { token: string; email: string }) => {
    const WrappedComponent = () => <ResetPassword loaderData={loaderData} />;
    const Stub = createRoutesStub([
        {
            path: '/',
            Component: WrappedComponent,
            action: async ({ request }) => action({ request, params: {}, context: mockContext } as any),
        },
    ]);
    return render(<Stub initialEntries={['/']} />);
};

const mockContext = {
    get: vi.fn(),
    set: vi.fn(),
} as any;

const mockResetPasswordWithToken = vi.mocked(resetPasswordWithToken);
const mockIsPasswordValid = vi.mocked(isPasswordValid);

describe('reset-password route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loader', () => {
        it('should return loader data when token and email are provided', () => {
            const mockRequest = new Request('http://localhost/reset-password?token=abc123&email=test@example.com');
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            };

            const result = loader(args);

            expect(result).toEqual({
                token: 'abc123',
                email: 'test@example.com',
            });
        });

        it('should redirect to forgot-password when token is missing', () => {
            const mockRequest = new Request('http://localhost/reset-password?email=test@example.com');
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            };

            const result = loader(args);

            // Check if it's a Response (redirect)
            expect(result).toBeInstanceOf(Response);
            if (result instanceof Response) {
                expect(result.status).toBe(302);
                expect(result.headers.get('Location')).toBe('/forgot-password');
            }
        });

        it('should redirect to forgot-password when email is missing', () => {
            const mockRequest = new Request('http://localhost/reset-password?token=abc123');
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            };

            const result = loader(args);

            // Check if it's a Response (redirect)
            expect(result).toBeInstanceOf(Response);
            if (result instanceof Response) {
                expect(result.status).toBe(302);
                expect(result.headers.get('Location')).toBe('/forgot-password');
            }
        });

        it('should redirect to forgot-password when both token and email are missing', () => {
            const mockRequest = new Request('http://localhost/reset-password');
            const args: LoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: mockContext,
            };

            const result = loader(args);

            expect(result).toBeInstanceOf(Response);
            if (result instanceof Response) {
                expect(result.status).toBe(302);
                expect(result.headers.get('Location')).toBe('/forgot-password');
            }
        });
    });

    describe('action', () => {
        describe('validation errors', () => {
            it('should redirect to forgot-password when token is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    expect(result.status).toBe(302);
                    const location = result.headers.get('Location');
                    // Token is critical - redirect to forgot-password page with generic error
                    expect(location).toBe('/forgot-password');
                }
            });

            it('should return specific error when email is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should return specific error when newPassword is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should return specific error when confirmPassword is missing', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should return specific error when passwords do not match', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Different456!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('resetPassword:passwordsMustMatch'),
                });
            });

            it('should return specific error when password is not strong enough', async () => {
                mockIsPasswordValid.mockReturnValue(false);

                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'weak');
                formData.append('confirmPassword', 'weak');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                expect(mockIsPasswordValid).toHaveBeenCalledWith('weak');
                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:passwordNotSecure'),
                });
            });
        });

        describe('successful password reset', () => {
            it('should redirect to login on successful password reset', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockResetPasswordWithToken.mockResolvedValue(undefined);

                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                expect(mockIsPasswordValid).toHaveBeenCalledWith('Test123!');
                expect(mockResetPasswordWithToken).toHaveBeenCalledWith(mockContext, {
                    email: 'test@example.com',
                    token: 'abc123',
                    newPassword: 'Test123!',
                });

                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    expect(result.status).toBe(302);
                    const location = result.headers.get('Location');
                    expect(location).toBe('/login');
                }
            });
        });

        describe('API errors', () => {
            it('should return generic error when password reset fails', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockResetPasswordWithToken.mockRejectedValue(new Error('Invalid token'));

                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                expect(mockResetPasswordWithToken).toHaveBeenCalled();
                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('errors:somethingWentWrong'),
                });
            });

            it('should not expose actual error message from API', async () => {
                mockIsPasswordValid.mockReturnValue(true);
                mockResetPasswordWithToken.mockRejectedValue(new Error('Token expired at 2025-01-01 12:00:00'));

                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                // Should show generic error, not the actual token expiration error
                expect(result).toEqual({
                    error: t('errors:somethingWentWrong'),
                });
            });
        });

        describe('edge cases', () => {
            it('should redirect to forgot-password when token is empty string', async () => {
                const formData = new URLSearchParams();
                formData.append('token', '');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                expect(result).toBeInstanceOf(Response);
                if (result instanceof Response) {
                    const location = result.headers.get('Location');
                    // Empty token is treated as missing token - redirect with generic error
                    expect(location).toBe('/forgot-password');
                }
            });

            it('should handle empty newPassword with specific error', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', '');
                formData.append('confirmPassword', 'Test123!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should handle empty confirmPassword with specific error', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc123');
                formData.append('email', 'test@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', '');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                // Returns error data, not redirect
                expect(result).toEqual({
                    error: t('signup:allFieldsRequired'),
                });
            });

            it('should return error data for validation failure with special characters', async () => {
                const formData = new URLSearchParams();
                formData.append('token', 'abc+123/xyz=');
                formData.append('email', 'test+user@example.com');
                formData.append('newPassword', 'Test123!');
                formData.append('confirmPassword', 'Different456!');

                const mockRequest = new Request('http://localhost/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData.toString(),
                });

                const args: ActionFunctionArgs = {
                    request: mockRequest,
                    params: {},
                    context: mockContext,
                };

                const result = await action(args);

                // Passwords don't match - should return error data
                expect(result).toEqual({
                    error: t('resetPassword:passwordsMustMatch'),
                });
            });
        });
    });

    describe('Component', () => {
        it('should render form with all required elements', () => {
            const loaderData = {
                token: 'test-token-123',
                email: 'test@example.com',
            };

            renderWithRoutesStub(loaderData);

            expect(screen.getByRole('heading', { name: t('resetPassword:title') })).toBeInTheDocument();
            expect(screen.getByLabelText(t('resetPassword:emailLabel'))).toBeInTheDocument();
            expect(screen.getByLabelText(t('resetPassword:newPasswordLabel'))).toBeInTheDocument();
            expect(screen.getByLabelText(t('resetPassword:confirmPasswordLabel'))).toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('resetPassword:resetPasswordButton') })).toBeInTheDocument();
        });

        it('should display error when passwords do not match', async () => {
            const user = userEvent.setup();
            mockIsPasswordValid.mockReturnValue(true);

            const loaderData = {
                token: 'test-token-123',
                email: 'test@example.com',
            };

            renderWithAction(loaderData);

            await user.type(screen.getByLabelText(t('resetPassword:newPasswordLabel')), 'Test123!');
            await user.type(screen.getByLabelText(t('resetPassword:confirmPasswordLabel')), 'Different456!');

            const submitButton = screen.getByRole('button', { name: t('resetPassword:resetPasswordButton') });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(t('resetPassword:passwordsMustMatch'))).toBeInTheDocument();
            });
        });

        // Note: "password not strong enough" validation is tested in action unit tests.
        // Full-flow testing is not possible here because client-side validation in
        // usePasswordValidation hook disables the submit button for weak passwords.

        it('should display error when API call fails', async () => {
            const user = userEvent.setup();
            mockIsPasswordValid.mockReturnValue(true);
            mockResetPasswordWithToken.mockRejectedValue(new Error('Invalid token'));

            const loaderData = {
                token: 'test-token-123',
                email: 'test@example.com',
            };

            renderWithAction(loaderData);

            await user.type(screen.getByLabelText(t('resetPassword:newPasswordLabel')), 'Test123!');
            await user.type(screen.getByLabelText(t('resetPassword:confirmPasswordLabel')), 'Test123!');

            const submitButton = screen.getByRole('button', { name: t('resetPassword:resetPasswordButton') });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(t('errors:somethingWentWrong'))).toBeInTheDocument();
            });
        });

        it('should not show error on initial render', () => {
            const loaderData = {
                token: 'test-token-123',
                email: 'test@example.com',
            };

            renderWithRoutesStub(loaderData);

            // No error should be visible initially (check for error container class)
            expect(screen.queryByText(/went wrong/i)).not.toBeInTheDocument();
        });
    });
});
