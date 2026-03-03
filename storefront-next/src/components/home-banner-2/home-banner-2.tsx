import type { HomeBanner2Props } from './types';

/**
 * Full-Height Banner Section 2 — mirrors SFRA #home-slot-2 content asset lk-home-banner-2.
 *
 * Full-width section with background image, dual gradient overlays (top dark-blue, bottom beige),
 * and right-aligned text container with heading, subheading, and CTA link.
 *
 * Source fonts: Paperback9-Roman (headings/CTA), proxima-nova (body)
 * Falls back to Tailwind serif/sans since custom fonts are not bundled.
 */
export function HomeBanner2({ heading, subheading, backgroundImageUrl, backgroundImageAlt, cta }: HomeBanner2Props) {
    return (
        <div data-slot-id="lk-content-home-banner-2" className="relative h-[1000px] overflow-hidden">
            {/* Background image — fills section, centered via object-cover */}
            <img
                src={backgroundImageUrl}
                alt={backgroundImageAlt}
                className="absolute inset-0 h-full w-full object-cover"
            />

            {/* Gradient overlay at top — fades from dark blue to transparent */}
            <div className="absolute left-0 right-0 top-0 h-[300px] bg-gradient-to-b from-[#0d1b28] to-transparent" />

            {/* Gradient overlay at bottom — fades from beige/grey to transparent */}
            <div className="absolute bottom-0 left-0 right-0 h-[300px] bg-gradient-to-t from-[#afb4c8] to-transparent" />

            {/* Text container — right-aligned, positioned at ~55% from left */}
            <div className="absolute left-[55%] top-[200px] z-10 max-w-[375px]">
                <h4 className="my-6 font-serif text-[26px] uppercase leading-[31.2px] tracking-[-0.13px] text-white">
                    {heading}
                </h4>
                <h3 className="my-8 font-serif text-[40px] leading-[40px] tracking-[-0.8px] text-white">
                    {subheading}
                </h3>
                <div>
                    <a
                        href={cta.href}
                        className="mx-1 inline-block border-b border-white px-0 py-px font-serif text-[28px] uppercase tracking-[1.6px] text-white transition-opacity hover:opacity-80"
                    >
                        {cta.label}
                    </a>
                </div>
            </div>
        </div>
    );
}
