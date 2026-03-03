import type { HomeBanner3Props } from './types';

/**
 * Full-Height Banner Section 3 — mirrors SFRA #home-slot-3 content asset lk-home-banner-3.
 *
 * Full-width section with golf course background image, centered text container
 * with watermark logo (10% opacity), heading, and body text.
 * Bottom gradient overlay fades to dark blue (#0d1b28).
 *
 * Source fonts: Paperback9-Roman (heading), proxima-nova (body)
 * Falls back to Tailwind serif/sans since custom fonts are not bundled.
 */
export function HomeBanner3({ heading, body, backgroundImageUrl, backgroundImageAlt, watermarkLogoUrl }: HomeBanner3Props) {
    return (
        <div data-slot-id="lk-content-home-banner-3" className="relative h-[1000px] overflow-hidden">
            {/* Background image — fills section, centered via object-cover */}
            <img
                src={backgroundImageUrl}
                alt={backgroundImageAlt}
                className="absolute inset-0 h-full w-full object-cover"
            />

            {/* Text container — centered over background image */}
            <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="max-w-[600px] text-center uppercase">
                    {/* Watermark logo — faint behind text */}
                    {watermarkLogoUrl && (
                        <div className="opacity-10">
                            <img
                                src={watermarkLogoUrl}
                                alt=""
                                aria-hidden="true"
                                className="mx-auto h-[378px] w-auto"
                            />
                        </div>
                    )}

                    <h3 className="mb-8 font-serif text-[40px] leading-[40px] tracking-[-0.8px] text-white">
                        {heading}
                    </h3>
                    <p className="my-5 font-sans text-[20px] normal-case tracking-[0.4px] text-white">
                        {body}
                    </p>
                </div>
            </div>

            {/* Gradient overlay at bottom — fades from dark blue to transparent */}
            <div className="absolute bottom-0 left-0 right-0 h-[300px] bg-gradient-to-t from-[#0d1b28] to-transparent" />
        </div>
    );
}
