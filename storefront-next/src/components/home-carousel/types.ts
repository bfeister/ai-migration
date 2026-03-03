export interface CarouselSlide {
    heading: string;
    imageUrl: string;
    imageAlt: string;
    cta: {
        label: string;
        href: string;
    };
}

export interface HomeCarouselProps {
    slides: readonly CarouselSlide[];
}
