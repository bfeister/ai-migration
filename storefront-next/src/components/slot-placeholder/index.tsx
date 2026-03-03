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

export interface SlotPlaceholderProps {
    /** The ISML slot ID this placeholder represents */
    slotId: string;
    /** Human-readable label for the slot region */
    label: string;
}

/**
 * Renders a visible placeholder for an ISML content slot region.
 * Used during migration to mark areas that will be filled by subsequent feature sub-plans.
 */
export function SlotPlaceholder({ slotId, label }: SlotPlaceholderProps) {
    return (
        <div
            className="flex min-h-[inherit] items-center justify-center border border-dashed border-muted-foreground/25 bg-muted/50 py-16 text-sm text-muted-foreground"
            data-slot-id={slotId}
        >
            {label}
        </div>
    );
}
