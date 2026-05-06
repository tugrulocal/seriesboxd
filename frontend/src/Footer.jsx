import { Link } from 'react-router-dom';
import { Github, Mail } from 'lucide-react';

export default function Footer() {
    return (
        <footer
            className="w-full self-stretch border-t border-gray-800 backdrop-blur-md bg-gray-950/90"
            style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
        >
            {/*  Main Row  */}
            <div className="w-full px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">

                {/* Left: Brand + TMDB attribution */}
                <div className="flex flex-col gap-2">
                    <Link
                        to="/"
                        className="text-xl font-black tracking-tight text-white hover:text-sky-400 transition-colors duration-200"
                    >
                        dizi<span className="text-sky-400">log</span>
                    </Link>
                    <p className="text-gray-600 text-[11px] leading-snug max-w-xs">
                        This product uses the TMDB API but is not endorsed or certified by TMDB.
                    </p>
                </div>

                {/* Right: Social icons */}
                <div className="flex items-center gap-3">
                    <a
                        href="https://github.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:border-sky-500 transition-all duration-200"
                        aria-label="GitHub"
                    >
                        <Github size={15} />
                    </a>
                    <a
                        href="mailto:seriesboxd@gmail.com"
                        className="w-8 h-8 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:border-sky-500 transition-all duration-200"
                        aria-label="E-posta"
                    >
                        <Mail size={15} />
                    </a>
                </div>
            </div>

            {/*  Bottom Band  */}
            <div className="border-t border-gray-800 w-full">
                <div className="w-full px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <p className="text-gray-600 text-xs">
                        © 2026 <span className="text-gray-400 font-medium">Dizilog</span>. Tüm hakları saklıdır.
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                        <span>Made with ❤️ for series lovers</span>
                        <span>·</span>
                        <span className="px-2 py-0.5 rounded-full border border-gray-700 text-gray-500 font-mono text-[11px]">
                            v1.0.4-beta
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
