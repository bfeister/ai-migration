'use client';

import { useState, useCallback, useEffect } from 'react';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import type { HomeCarouselProps } from './types';

/**
 * Homepage Collection Carousel — mirrors SFRA #home-slot-4 content asset lk-home-carousel.
 *
 * Split-panel layout per slide:
 *   Left ~70%: Product collection image (overflow-hidden, object-cover)
 *   Right ~30%: Centered heading + "LEARN MORE" CTA on dark background
 *
 * Source: Slick slider with 4 collection slides, infinite loop, arrow navigation.
 * Fonts: Paperback9-Roman (headings/CTA) → Tailwind serif fallback.
 */
export function HomeCarousel({ slides }: HomeCarouselProps) {
    const [api, setApi] = useState<CarouselApi | null>(null);
    const [currentSlide, setCurrentSlide] = useState(0);

    const onSelect = useCallback(() => {
        if (!api) return;
        setCurrentSlide(api.selectedScrollSnap());
    }, [api]);

    useEffect(() => {
        if (!api) return;
        onSelect();
        api.on('select', onSelect);
        api.on('reInit', onSelect);
        return () => {
            api.off('select', onSelect);
            api.off('reInit', onSelect);
        };
    }, [api, onSelect]);

    if (slides.length === 0) return null;

    return (
        <div data-slot-id="lk-content-home-carousel" className="bg-[#0d1b28] pb-8 pt-[58px]">
            <div className="relative">
                <Carousel
                    setApi={setApi}
                    opts={{ align: 'center', loop: true, containScroll: 'trimSnaps' }}
                    className="h-[585px] w-full"
                >
                    <CarouselContent className="-ml-0">
                        {slides.map((slide) => (
                            <CarouselItem key={slide.heading} className="pl-0">
                                <div className="flex h-[585px] w-full">
                                    {/* Left panel: collection image (~70%) */}
                                    <div className="relative h-full w-[70%] overflow-hidden">
                                        <img
                                            src={slide.imageUrl}
                                            alt={slide.imageAlt}
                                            className="absolute inset-0 h-full w-full object-cover"
                                        />
                                    </div>

                                    {/* Right panel: heading + CTA (~30%) */}
                                    <div className="relative flex h-full w-[30%] items-center justify-center px-[6%]">
                                        <div className="text-center uppercase">
                                            <h3 className="my-8 font-serif text-[40px] leading-[40px] tracking-[-0.8px] text-white">
                                                {slide.heading}
                                            </h3>
                                            <a
                                                href={slide.cta.href}
                                                className="inline-block border-b border-white px-0 py-px font-serif text-[13px] uppercase tracking-[1.6px] text-white transition-opacity hover:opacity-80"
                                            >
                                                {slide.cta.label}
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                </Carousel>

                {/* Navigation arrows */}
                {slides.length > 1 && (
                    <>
                        <button
                            onClick={() => api?.scrollPrev()}
                            className="absolute left-6 top-1/2 z-10 -translate-y-1/2 p-2 text-white/60 transition-colors hover:text-white"
                            aria-label={`Previous slide (${currentSlide + 1} of ${slides.length})`}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <button
                            onClick={() => api?.scrollNext()}
                            className="absolute right-6 top-1/2 z-10 -translate-y-1/2 p-2 text-white/60 transition-colors hover:text-white"
                            aria-label={`Next slide (${currentSlide + 1} of ${slides.length})`}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </>
                )}

                {/* Dot indicators */}
                {slides.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2" role="tablist" aria-label="Slide navigation">
                        {slides.map((slide, index) => (
                            <button
                                key={`dot-${slide.heading}`}
                                onClick={() => api?.scrollTo(index)}
                                className={`h-2 transition-all duration-300 ${
                                    currentSlide === index ? 'w-8 bg-white' : 'w-2 bg-white/50 hover:bg-white/75'
                                }`}
                                role="tab"
                                aria-selected={currentSlide === index}
                                aria-label={`Go to slide ${index + 1} of ${slides.length}`}
                                tabIndex={currentSlide === index ? 0 : -1}
                            />
                        ))}
                    </div>
                )}

                {/* Screen reader live region */}
                <div className="sr-only" aria-live="polite" aria-atomic="true">
                    Slide {currentSlide + 1} of {slides.length}: {slides[currentSlide]?.heading}
                </div>
            </div>
        </div>
    );
}
