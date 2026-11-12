import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  X,
} from "lucide-react";
type Thread = {
  id: number;
  title: string;
  home_id: number;
  owner_id: number;
  viewing_at: string;
  viewing_status: string;
  owner_name: string;
  sender_name: string;
};
export default function Viewings({
  threads,
  userId,
  onUpdate,
}: {
  threads: Thread[];
  userId: number;
  onUpdate: (id: number, body: unknown) => Promise<void>;
}) {
  const [mode, setMode] = useState(() =>
      window.matchMedia("(max-width:540px)").matches ? "day" : "week",
    ),
    [selected, setSelected] = useState(() =>
      (() => {
        const first = threads
          .filter((t) => t.viewing_at && t.viewing_status !== "cancelled")
          .sort(
            (a, b) => Date.parse(a.viewing_at) - Date.parse(b.viewing_at),
          )[0];
        const d = first ? new Date(first.viewing_at) : new Date();
        return [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, "0"),
          String(d.getDate()).padStart(2, "0"),
        ].join("-");
      })(),
    ),
    [error, setError] = useState(""),
    [dragId, setDragId] = useState<number | null>(null);
  const initial = useRef(false);
  useEffect(() => {
    if (initial.current || !threads.some((t) => t.viewing_at)) return;
    const first = threads
      .filter((t) => t.viewing_at && t.viewing_status !== "cancelled")
      .sort((a, b) => Date.parse(a.viewing_at) - Date.parse(b.viewing_at))[0];
    if (first) {
      const d = new Date(first.viewing_at);
      setSelected(
        [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, "0"),
          String(d.getDate()).padStart(2, "0"),
        ].join("-"),
      );
      initial.current = true;
    }
  }, [threads]);
  const date = new Date(selected + "T12:00:00"),
    start = new Date(date);
  if (mode === "week")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (mode === "month") start.setDate(1);
  const length =
    mode === "day"
      ? 1
      : mode === "week"
        ? 7
        : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const days = Array.from({ length }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const key = (d: Date) =>
    [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  const viewings = threads.filter((t) => !!t.viewing_at);
  async function update(id: number, body: unknown) {
    setError("");
    try {
      await onUpdate(id, body);
    } catch (e: any) {
      setError(e.message);
    }
  }
  function move(delta: number) {
    const d = new Date(date);
    if (mode === "month") d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta * (mode === "week" ? 7 : 1));
    setSelected(key(d));
  }
  return (
    <>
      <div className="viewings-head">
        <div>
          <p className="eyebrow">MAKE ROOM FOR A CLOSER LOOK</p>
          <h1>Your viewings</h1>
          <p className="muted">
            In-app demo appointments. Requested times need the property owner's
            confirmation.
          </p>
        </div>
        <CalendarDays size={40} />
      </div>
      <div className="viewing-toolbar">
        <div className="segmented">
          {["day", "week", "month"].map((m) => (
            <button
              className={mode === m ? "selected" : ""}
              onClick={() => setMode(m)}
              key={m}
            >
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <div>
          <button
            className="icon-button"
            aria-label="Previous period"
            onClick={() => move(-1)}
          >
            <ArrowLeft size={17} />
          </button>
          <input
            aria-label="Calendar date"
            type="date"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          />
          <button
            className="icon-button"
            aria-label="Next period"
            onClick={() => move(1)}
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className={"viewing-calendar " + mode}>
        {days.map((d) => (
          <section
            key={key(d)}
            className={
              "viewing-day " + (key(d) === key(new Date()) ? "today" : "")
            }
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) {
                const t = viewings.find((t) => t.id === dragId)!;
                const next = new Date(t.viewing_at);
                next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                update(t.id, {
                  status: "requested",
                  viewing_at: next.toISOString(),
                });
                setDragId(null);
              }
            }}
          >
            <header>
              <span>
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <b>{d.getDate()}</b>
            </header>
            {viewings
              .filter(
                (t) =>
                  key(new Date(t.viewing_at)) === key(d) &&
                  t.viewing_status !== "cancelled",
              )
              .map((t) => (
                <article
                  key={t.id}
                  className={"calendar-event " + t.viewing_status}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                >
                  <span>
                    {new Date(t.viewing_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {t.viewing_status}
                  </span>
                  <Link to={"/home-details/" + t.home_id}>{t.title}</Link>
                  <p>{t.owner_id === userId ? t.sender_name : t.owner_name}</p>
                </article>
              ))}
          </section>
        ))}
      </div>
      <p className="fine-print">
        Drag a viewing onto another date to propose a new time. Changing a time
        resets it to requested. On mobile, use the time form below. All times
        use your device's timezone.
      </p>
      <div className="viewing-agenda">
        {!viewings.length ? (
          <div className="state">
            <CalendarDays />
            <h2>No viewing requests yet.</h2>
            <p>
              Start an inquiry on another seller's property and choose a
              preferred time.
            </p>
          </div>
        ) : (
          viewings.map((t) => (
            <article key={t.id} className="viewing-row">
              <div>
                <span className={"status-pill " + t.viewing_status}>
                  {t.viewing_status}
                </span>
                <Link to={"/home-details/" + t.home_id}>
                  <h2>
                    {t.title}
                    <ArrowUpRight size={17} />
                  </h2>
                </Link>
                <p>
                  {new Date(t.viewing_at).toLocaleString()} ·{" "}
                  {t.owner_id === userId ? t.sender_name : t.owner_name}
                </p>
              </div>
              <div className="viewing-actions">
                {t.viewing_status === "requested" && t.owner_id === userId && (
                  <button
                    className="outline-button"
                    onClick={() => update(t.id, { status: "confirmed" })}
                  >
                    <Check size={14} />
                    Confirm
                  </button>
                )}
                {t.viewing_status !== "cancelled" && (
                  <button
                    className="text-button"
                    onClick={() => update(t.id, { status: "cancelled" })}
                  >
                    <X size={14} />
                    Cancel request
                  </button>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const at = String(new FormData(e.currentTarget).get("at"));
                    update(t.id, {
                      status: "requested",
                      viewing_at: new Date(at).toISOString(),
                    });
                  }}
                >
                  <label className="sr-only" htmlFor={"time-" + t.id}>
                    New time for {t.title}
                  </label>
                  <input
                    id={"time-" + t.id}
                    name="at"
                    type="datetime-local"
                    required
                  />
                  <button className="primary">Propose time</button>
                </form>
              </div>
            </article>
          ))
        )}
      </div>
    </>
  );
}
