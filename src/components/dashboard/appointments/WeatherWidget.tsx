import React, { useState, useEffect } from 'react';
import { Cloud, CloudRain, Sun, Thermometer, Wind, Loader2 } from 'lucide-react';

interface WeatherWidgetProps {
  lat?: number;
  lon?: number;
  displayCity?: string;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  lat = 34.953,
  lon = -120.4357,
  displayCity = 'Santa Maria, CA',
}) => {
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Current Santa Maria Coordinates
    // coordinates from dealership settings
    
    // Using Open-Meteo (Free, no API key required)
    const fetchWeather = async () => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`);
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();
        setWeather(data.current);
      } catch (err) {
        // Never show invented weather as if it were a live reading — the widget
        // hides itself instead.
        setWeather(null);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 300000); // Update every 5 mins
    return () => clearInterval(interval);
  }, [lat, lon]);

  const getWeatherIcon = (code: number) => {
    if (code === 0) return <Sun className="text-amber-400" size={32} />;
    if (code <= 3) return <Cloud className="text-slate-300" size={32} />;
    if (code >= 51) return <CloudRain className="text-blue-400" size={32} />;
    return <Cloud className="text-slate-400" size={32} />;
  };

  const getWeatherString = (code: number) => {
    if (code === 0) return "Clear Skies";
    if (code <= 3) return "Partly Cloudy";
    if (code >= 51) return "Rainy";
    return "Overcast";
  };

  // No live reading available (offline, blocked, or rate-limited): render nothing
  // rather than a plausible-looking invented one.
  if (!loading && !weather) return null;

  if (loading) return (
    <div className="flex items-center justify-center p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
      <Loader2 className="animate-spin text-slate-500" size={24} />
    </div>
  );

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-3xl border border-slate-800/50 shadow-2xl relative overflow-hidden group">
      {/* Background Glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand-primary/10 rounded-full blur-3xl group-hover:bg-brand-primary/20 transition-colors duration-500"></div>
      
      <div className="flex items-center justify-between relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{displayCity}</span>
          </div>
          <h3 className="text-4xl font-black text-white tracking-tighter">
            {Math.round(weather.temperature_2m)}°F
          </h3>
          <p className="text-slate-400 text-xs font-bold mt-1">{getWeatherString(weather.weather_code)}</p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {getWeatherIcon(weather.weather_code)}
          <div className="flex items-center gap-4 text-slate-500">
            <div className="flex items-center gap-1">
              <Wind size={12} />
              <span className="text-[10px] font-bold">{Math.round(weather.wind_speed_10m)} mph</span>
            </div>
            <div className="flex items-center gap-1">
              <Thermometer size={12} />
              <span className="text-[10px] font-bold">{Math.round(weather.apparent_temperature)}° (Feels)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between">
        <p className="text-[9px] font-black text-brand-secondary uppercase tracking-widest">Service Desk Priority</p>
        <span className="text-[10px] font-bold text-slate-200">
          {weather.weather_code >= 51 ? "High (Rainy Day Protocol)" : "Standard Operations"}
        </span>
      </div>
    </div>
  );
};
