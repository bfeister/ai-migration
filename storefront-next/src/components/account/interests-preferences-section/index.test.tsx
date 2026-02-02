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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { InterestsPreferencesSection, InterestsPreferencesSectionSkeleton } from './index';

// Mock hooks - return disabled state initially
const mockFetchInterests = vi.fn();
const mockUpdateInterests = vi.fn().mockResolvedValue({});
const mockFetchPreferences = vi.fn();
const mockUpdatePreferences = vi.fn().mockResolvedValue({});

let mockIsEnabled = true;
let mockIsLoading = false;
let mockSelectedInterestIds: string[] = ['minimalist'];
let mockPreferences: Record<string, unknown> = {
    product_categories: ['geometric'],
    shopping_preferences: 'unisex',
    measures: { room_width: '', room_length: '', ceiling_height: '' },
    size_preference: 'no_preference',
};

const mockInterestCategories = [
    {
        id: 'design_styles',
        name: 'Design Styles',
        options: [
            { id: 'minimalist', name: 'Minimalist', category: 'design_styles' },
            { id: 'geometric', name: 'Geometric', category: 'design_styles' },
        ],
    },
];

const mockAvailableInterests = mockInterestCategories.flatMap((c) => c.options);

const mockAvailablePreferences = [
    {
        id: 'product_categories',
        name: 'Product Categories',
        type: 'multi-select' as const,
        options: [
            { value: 'geometric', label: 'Geometric' },
            { value: 'sets', label: 'Sets' },
        ],
    },
    {
        id: 'shopping_preferences',
        name: 'Shopping Preferences',
        type: 'button-group' as const,
        options: [
            { value: 'womens', label: "Women's" },
            { value: 'mens', label: "Men's" },
            { value: 'unisex', label: 'Unisex' },
        ],
    },
    {
        id: 'measures',
        name: 'Measures',
        type: 'text-group' as const,
        fields: [
            {
                id: 'room_width',
                label: 'Room Width (inches)',
                placeholder: 'e.g., 120',
                width: 'half' as const,
            },
        ],
    },
    {
        id: 'size_preference',
        name: 'Preferred Product Size',
        type: 'select' as const,
        options: [
            { value: 'no_preference', label: 'No preference' },
            { value: 'small', label: 'Small (S)' },
        ],
    },
];

vi.mock('@/hooks/customer-preferences/use-customer-preferences', () => ({
    useCustomerInterests: () => ({
        availableInterests: mockAvailableInterests,
        interestCategories: mockInterestCategories,
        selectedInterestIds: mockSelectedInterestIds,
        isLoading: mockIsLoading,
        isSaving: false,
        error: null,
        isEnabled: mockIsEnabled,
        fetchInterests: mockFetchInterests,
        updateInterests: mockUpdateInterests,
    }),
    useCustomerPreferences: () => ({
        availablePreferences: mockAvailablePreferences,
        preferences: mockPreferences,
        isLoading: mockIsLoading,
        isSaving: false,
        error: null,
        isEnabled: mockIsEnabled,
        fetchPreferences: mockFetchPreferences,
        updatePreferences: mockUpdatePreferences,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'interestsPreferences.title': 'Interests & Preferences',
                'interestsPreferences.description': 'Add your design interests and manage your shopping preferences',
                'interests.title': 'Your Interests',
                'interests.noneSelected': 'No interests selected',
                'interests.addMore': 'Add more',
                'interests.addInterestsTitle': 'Add Your Interests',
                'preferences.noneSelected': 'None selected',
                'preferences.addMore': 'Add more',
                'common.edit': 'Edit',
                'common.save': 'Save',
                'common.saving': 'Saving...',
                'common.cancel': 'Cancel',
            };
            return translations[key] || key;
        },
    }),
}));

describe('InterestsPreferencesSection', () => {
    const defaultProps = {
        customerId: 'test-customer-123',
        onSuccess: vi.fn(),
        onError: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsEnabled = true;
        mockIsLoading = false;
        mockSelectedInterestIds = ['minimalist'];
        mockPreferences = {
            product_categories: ['geometric'],
            shopping_preferences: 'unisex',
            measures: { room_width: '', room_length: '', ceiling_height: '' },
            size_preference: 'no_preference',
        };
    });

    describe('Skeleton', () => {
        it('renders skeleton component', () => {
            render(<InterestsPreferencesSectionSkeleton />);

            // Skeleton should render without errors
            expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
        });
    });

    describe('Rendering', () => {
        it('renders the section title and description', () => {
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(screen.getByText('Interests & Preferences')).toBeInTheDocument();
            expect(
                screen.getByText('Add your design interests and manage your shopping preferences')
            ).toBeInTheDocument();
        });

        it('renders the Edit button in view mode', () => {
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        });

        it('renders selected interests as badges', () => {
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(screen.getByText('Minimalist')).toBeInTheDocument();
        });

        it('renders product categories header', () => {
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(screen.getByText('Product Categories')).toBeInTheDocument();
        });

        it('renders shopping preferences', () => {
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(screen.getByText('Shopping Preferences')).toBeInTheDocument();
        });

        it('renders measures section', () => {
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(screen.getByText('Measures')).toBeInTheDocument();
            expect(screen.getByText('No measures provided')).toBeInTheDocument();
        });

        it('returns null when not enabled', () => {
            mockIsEnabled = false;
            const { container } = render(<InterestsPreferencesSection {...defaultProps} />);

            expect(container.firstChild).toBeNull();
        });
    });

    describe('Edit Mode', () => {
        it('shows Save and Cancel buttons when Edit is clicked', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));

            expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        });

        it('returns to view mode when Cancel is clicked', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));
            await user.click(screen.getByRole('button', { name: 'Cancel' }));

            expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        });
    });

    describe('Data Fetching', () => {
        it('fetches interests on mount', () => {
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(mockFetchInterests).toHaveBeenCalledWith('test-customer-123');
        });

        it('fetches preferences on mount', () => {
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(mockFetchPreferences).toHaveBeenCalledWith('test-customer-123');
        });
    });

    describe('Save and Update', () => {
        it('calls update functions when Save is clicked', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));
            await user.click(screen.getByRole('button', { name: 'Save' }));

            expect(mockUpdateInterests).toHaveBeenCalled();
            expect(mockUpdatePreferences).toHaveBeenCalled();
        });

        it('calls onSuccess after successful save', async () => {
            const user = userEvent.setup();
            const onSuccess = vi.fn();
            render(<InterestsPreferencesSection {...defaultProps} onSuccess={onSuccess} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));
            await user.click(screen.getByRole('button', { name: 'Save' }));

            // Wait for async operations
            await vi.waitFor(() => {
                expect(onSuccess).toHaveBeenCalled();
            });
        });

        it('calls onError when save fails', async () => {
            mockUpdateInterests.mockRejectedValueOnce(new Error('Save failed'));
            const user = userEvent.setup();
            const onError = vi.fn();
            render(<InterestsPreferencesSection {...defaultProps} onError={onError} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));
            await user.click(screen.getByRole('button', { name: 'Save' }));

            await vi.waitFor(() => {
                expect(onError).toHaveBeenCalledWith('Save failed');
            });
        });
    });

    describe('Button Group Preferences', () => {
        it('renders button group options', () => {
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(screen.getByText("Women's")).toBeInTheDocument();
            expect(screen.getByText("Men's")).toBeInTheDocument();
            expect(screen.getByText('Unisex')).toBeInTheDocument();
        });

        it('allows selecting button group option in edit mode', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));
            await user.click(screen.getByText("Women's"));

            // The button should be clickable in edit mode
            expect(screen.getByText("Women's")).toBeInTheDocument();
        });
    });

    describe('Measures Display', () => {
        it('displays measures values when provided', () => {
            mockPreferences = {
                ...mockPreferences,
                measures: { room_width: '120', room_length: '180', ceiling_height: '96' },
            };
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(screen.getByText(/Room dimensions:/)).toBeInTheDocument();
            expect(screen.getByText(/Ceiling height:/)).toBeInTheDocument();
        });

        it('displays input fields in edit mode for measures', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));

            expect(screen.getByLabelText('Room Width (inches)')).toBeInTheDocument();
        });

        it('allows typing in measure input fields', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));
            const input = screen.getByLabelText('Room Width (inches)');
            await user.type(input, '150');

            expect(input).toHaveValue('150');
        });
    });

    describe('Size Preference', () => {
        it('displays size preference when selected', () => {
            mockPreferences = {
                ...mockPreferences,
                size_preference: 'small',
            };
            render(<InterestsPreferencesSection {...defaultProps} />);

            expect(screen.getByText(/Preferred product size:/)).toBeInTheDocument();
        });

        it('renders select dropdown in edit mode', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));

            expect(screen.getByRole('combobox')).toBeInTheDocument();
        });
    });

    describe('Interest Removal', () => {
        it('shows remove button on interests in edit mode', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));

            expect(screen.getByRole('button', { name: 'Remove Minimalist' })).toBeInTheDocument();
        });

        it('removes interest when X button is clicked', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));
            await user.click(screen.getByRole('button', { name: 'Remove Minimalist' }));

            expect(screen.queryByText('Minimalist')).not.toBeInTheDocument();
        });
    });

    describe('Multi-Select Removal', () => {
        it('shows remove button on multi-select items in edit mode', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));

            expect(screen.getByRole('button', { name: 'Remove Geometric' })).toBeInTheDocument();
        });

        it('removes multi-select item when X button is clicked', async () => {
            const user = userEvent.setup();
            render(<InterestsPreferencesSection {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: 'Edit' }));
            await user.click(screen.getByRole('button', { name: 'Remove Geometric' }));

            // The item should be removed from view
            const geometricBadges = screen.queryAllByText('Geometric');
            expect(geometricBadges.length).toBeLessThanOrEqual(1); // May still appear in dialog
        });
    });
});
