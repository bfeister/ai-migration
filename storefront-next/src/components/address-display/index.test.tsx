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
import { describe, test, expect } from 'vitest';
import AddressDisplay from './index';
import type { ShopperCustomers } from '@salesforce/storefront-next-runtime/scapi';

describe('AddressDisplay', () => {
    describe('when no address is provided', () => {
        test('user sees "No address provided" message', () => {
            render(<AddressDisplay address={null as never} />);

            expect(screen.getByText('No address provided')).toBeInTheDocument();
        });

        test('user does not see any address details', () => {
            render(<AddressDisplay address={null as never} />);

            // No address line, city, etc. should be visible
            expect(screen.queryByText(/123|Main St|New York/i)).not.toBeInTheDocument();
        });
    });

    describe('when complete address with all fields is provided', () => {
        const completeAddress: ShopperCustomers.schemas['CustomerAddress'] = {
            addressId: 'address-1',
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main Street',
            address2: 'Apt 4B',
            city: 'New York',
            stateCode: 'NY',
            postalCode: '10001',
            countryCode: 'US',
            phone: '555-123-4567',
        };

        test('renders address1 and location line', () => {
            render(<AddressDisplay address={completeAddress} />);

            // AddressDisplay now only shows address1 and location line
            expect(screen.getByText('123 Main Street')).toBeInTheDocument();
            // Location line format: postalCode, city, state, country
            expect(screen.getByText('10001, New York, New York, United States')).toBeInTheDocument();
        });

        test('does not display name, address2, or phone', () => {
            const { container } = render(<AddressDisplay address={completeAddress} />);

            // These fields are not displayed in the new format
            expect(container.textContent).not.toContain('John Doe');
            expect(container.textContent).not.toContain('Apt 4B');
            expect(container.textContent).not.toContain('555-123-4567');
        });
    });

    describe('when address has only required fields', () => {
        const minimalAddress: ShopperCustomers.schemas['CustomerAddress'] = {
            addressId: 'address-2',
            countryCode: 'US',
            firstName: 'Jane',
            lastName: 'Smith',
            address1: '456 Oak Avenue',
            city: 'Seattle',
        };

        test('user sees address1 and city with country', () => {
            render(<AddressDisplay address={minimalAddress} />);

            expect(screen.getByText('456 Oak Avenue')).toBeInTheDocument();
            expect(screen.getByText('Seattle, United States')).toBeInTheDocument();
        });
    });

    describe('when address has city with state but no postal code', () => {
        const addressWithState: ShopperCustomers.schemas['CustomerAddress'] = {
            addressId: 'address-3',
            countryCode: 'US',
            firstName: 'Bob',
            lastName: 'Johnson',
            address1: '789 Pine Road',
            city: 'Austin',
            stateCode: 'TX',
        };

        test('user sees city, state name, and country', () => {
            render(<AddressDisplay address={addressWithState} />);

            expect(screen.getByText('789 Pine Road')).toBeInTheDocument();
            expect(screen.getByText('Austin, Texas, United States')).toBeInTheDocument();
        });
    });

    describe('when address has city with postal code but no state', () => {
        const addressWithPostal: ShopperCustomers.schemas['CustomerAddress'] = {
            addressId: 'address-4',
            countryCode: 'US',
            firstName: 'Alice',
            lastName: 'Williams',
            address1: '321 Elm Boulevard',
            city: 'Boston',
            postalCode: '02101',
        };

        test('user sees postal code, city, and country', () => {
            render(<AddressDisplay address={addressWithPostal} />);

            expect(screen.getByText('321 Elm Boulevard')).toBeInTheDocument();
            expect(screen.getByText('02101, Boston, United States')).toBeInTheDocument();
        });
    });

    describe('when address has all location fields', () => {
        const fullCityAddress: ShopperCustomers.schemas['CustomerAddress'] = {
            addressId: 'address-5',
            countryCode: 'US',
            firstName: 'Charlie',
            lastName: 'Brown',
            address1: '555 Maple Lane',
            city: 'Chicago',
            stateCode: 'IL',
            postalCode: '60601',
        };

        test('user sees postal code, city, state name, and country name', () => {
            render(<AddressDisplay address={fullCityAddress} />);

            expect(screen.getByText('555 Maple Lane')).toBeInTheDocument();
            expect(screen.getByText('60601, Chicago, Illinois, United States')).toBeInTheDocument();
        });
    });

    describe('when address has empty string values', () => {
        const addressWithEmptyStrings: ShopperCustomers.schemas['CustomerAddress'] = {
            addressId: 'address-6',
            firstName: 'Test',
            lastName: 'User',
            address1: '999 Test Street',
            address2: '',
            city: 'Portland',
            stateCode: '',
            postalCode: '',
            countryCode: '',
            phone: '',
        };

        test('user sees address1 and city only', () => {
            render(<AddressDisplay address={addressWithEmptyStrings} />);

            expect(screen.getByText('999 Test Street')).toBeInTheDocument();
            expect(screen.getByText('Portland')).toBeInTheDocument();
        });
    });

    describe('Canadian addresses', () => {
        const canadianAddress: ShopperCustomers.schemas['CustomerAddress'] = {
            addressId: 'address-8',
            firstName: 'Sarah',
            lastName: 'Martin',
            address1: '24 Sussex Drive',
            city: 'Ottawa',
            stateCode: 'ON',
            postalCode: 'K1M 1M4',
            countryCode: 'CA',
            phone: '+1-613-555-0199',
        };

        test('user sees Canadian address with province name and country name', () => {
            render(<AddressDisplay address={canadianAddress} />);

            expect(screen.getByText('24 Sussex Drive')).toBeInTheDocument();
            expect(screen.getByText('K1M 1M4, Ottawa, Ontario, Canada')).toBeInTheDocument();
        });
    });
});
