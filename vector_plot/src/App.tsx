import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import type { ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(LineElement, PointElement, LinearScale, Tooltip, Legend);

const DISPLAY_HZ = 6; // UI refresh rate (data still arrives at 60Hz)
const WINDOW_MS = 10_000;


type Sample = {
  t: number; // timestamp (ms)
  x: number;
  y: number;
  z: number;
  mag: number;
  theta: number;
};

function magnitude(x: number, y: number, z: number) {
  return Math.sqrt(x * x + y * y + z * z);
}

// Direction angle in the XY plane
function thetaAzimuth(x: number, y: number) {
  return Math.atan2(y, x);
}

export default function App() {
  // Fast buffer for incoming samples
  const bufferRef = useRef<Sample[]>([]);

  // Slower copy used for rendering
  const [renderData, setRenderData] = useState<Sample[]>([]);
  const [isRunning, setIsRunning] = useState(true);

  // Simulated 60Hz data stream (replace with SSE/WebSocket)
  useEffect(() => {
    if (!isRunning) return;

    const id = setInterval(() => {
      const incoming = JSON.stringify({
        x: Math.sin(Date.now() / 200),
        y: Math.cos(Date.now() / 250),
        z: Math.sin(Date.now() / 300) * 0.5,
      });

      let obj: any;
      try {
        obj = JSON.parse(incoming);
      } catch {
        return;
      }

      const x = Number(obj?.x ?? 0);
      const y = Number(obj?.y ?? 0);
      const z = Number(obj?.z ?? 0);
      if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return;

      const sample: Sample = {
        t: Date.now(),
        x,
        y,
        z,
        mag: magnitude(x, y, z),
        theta: thetaAzimuth(x, y),
      };

      const buf = bufferRef.current;
      buf.push(sample);

    const now = Date.now();

    while (buf.length > 0 && now - buf[0].t > WINDOW_MS) {
      buf.shift();
    }
    }, 1000 / 60);

    return () => clearInterval(id);
  }, [isRunning]);

  // Throttled render loop
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const frameMs = 1000 / DISPLAY_HZ;

    const loop = (now: number) => {
      if (now - last >= frameMs) {
        last = now;
        setRenderData([...bufferRef.current]);
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const chartData = useMemo(() => {
    if (renderData.length === 0) {
      return {
        datasets: [
          { label: "Magnitude", data: [] },
          { label: "Theta (rad)", data: [] },
        ],
      };
    }

    const t0 = renderData[0].t;

    return {
      datasets: [
        {
          label: "Magnitude",
          data: renderData.map((s) => ({
            x: (s.t - t0) / 1000,
            y: s.mag,
          })),
          borderColor: "rgb(220, 38, 38)",
          backgroundColor: "rgba(220, 38, 38, 0.2)",
          borderWidth: 2,
          tension: 0.2,
          pointRadius: 0,
        },
        {
          label: "Theta (rad)",
          data: renderData.map((s) => ({
            x: (s.t - t0) / 1000,
            y: s.theta,
          })),
          borderColor: "rgb(37, 99, 235)",
          backgroundColor: "rgba(37, 99, 235, 0.2)",
          borderWidth: 2,
          tension: 0.2,
          pointRadius: 0,
        },
      ],
    };
  }, [renderData]);

  const options: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      animation: false,
      plugins: {
        legend: { display: true },
      },
      scales: {
        x: {
          type: "linear",
          title: { display: true, text: "Time (s)" },
          ticks: {
            stepSize: 1,
            precision: 0,
          },
        },
        y: { display: true },
      },
    }),
    []
  );

  return (
    <div style={{ maxWidth: 1000, margin: "24px auto", padding: 16 }}>
      <h2>60Hz JSON Stream → Magnitude & Theta</h2>

      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <button onClick={() => setIsRunning((v) => !v)}>
          {isRunning ? "Pause" : "Resume"}
        </button>
        <button
          onClick={() => {
            bufferRef.current = [];
            setRenderData([]);
          }}
        >
          Clear
        </button>
      </div>

      <Line data={chartData} options={options} />
    </div>
  );
}
