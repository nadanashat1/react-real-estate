import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  MapPin,
  BedDouble,
  Bath,
  Maximize,
  Heart,
  X,
  Menu,
  SlidersHorizontal,
  Check,
  Home as House,
  Mail,
  Plus,
  LogOut,
  CalendarDays,
  ArrowLeft,
} from "lucide-react";
import "./portfolio.css";
import PropertyMap from "./PropertyMap";
import HomeExplorer from "./HomeExplorer";
import Viewings from "./Viewings";

type User = { id: number; name: string; email: string; role: string };
type Home = {
  id: number;
  title: string;
  city: string;
  neighborhood: string;
  price: number;
  kind: string;
  type: string;
  beds: number;
  baths: number;
  area: number;
  photo: string;
  description: string;
  demo: number;
  saved?: boolean;
  owner_id?: number;
  owner_name?: string;
  latitude?: number;
  longitude?: number;
};
async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch("/api" + url, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error || "The request could not be completed.");
  return data;
}
const money = (h: Home) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(h.price);
function AppContent() {
  const nav = useNavigate(),
    location = useLocation();
  const [params] = useSearchParams();
  const [user, setUser] = useState<User | null>(null),
    [homes, setHomes] = useState<Home[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0);
  const [auth, setAuth] = useState(""),
    [menu, setMenu] = useState(false),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [uploadedPhoto, setUploadedPhoto] = useState(""),
    [point, setPoint] = useState<[number, number] | null>(null);
  const [detail, setDetail] = useState<Home | null>(null),
    [threads, setThreads] = useState<any[]>([]),
    [editor, setEditor] = useState<Home | Partial<Home> | null>(null);
  const catalog = useRef<HTMLElement>(null);
  const kind = params.get("kind") || "sale",
    view = params.get("view") || "";
  const isHome = location.pathname === "/";
  const detailId = location.pathname.match(/^\/home-details\/(\d+)$/)?.[1];
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    if (!user) return;
    const stream = new EventSource("/api/events");
    stream.onmessage = () => refresh();
    return () => stream.close();
  }, [user?.id]);
  useEffect(() => {
    api("/auth/me")
      .then((x) => setUser(x.user))
      .catch(() => {});
  }, []);
  useEffect(() => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams(params);
    q.delete("view");
    if (!view && !q.has("kind")) q.set("kind", "sale");
    if (view === "saved") q.set("saved", "1");
    if (view === "mine") q.set("mine", "1");
    api("/homes?" + q)
      .then((x) => setHomes(x.homes))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.toString(), revision, user?.id]);
  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    setError("");
    api("/homes/" + detailId)
      .then((x) => setDetail(x.home))
      .catch((e) => setError(e.message));
    window.scrollTo(0, 0);
  }, [detailId, revision]);
  useEffect(() => {
    if ((view === "inbox" || view === "viewings") && user)
      api("/inquiries")
        .then((x) => setThreads(x.threads))
        .catch((e) => setError(e.message));
  }, [view, user, revision]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    setMenu(false);
  }, [location.key]);
  const browse = (next: string) => nav("/all-homes?kind=" + next);
  useEffect(() => {
    setUploadedPhoto(
      editor?.photo?.startsWith("/uploads/") ? editor.photo : "",
    );
    setPoint(
      editor?.latitude != null && editor?.longitude != null
        ? [editor.latitude, editor.longitude]
        : null,
    );
  }, [editor]);
  const requireUser = () => {
    if (user) return true;
    setFormError("");
    setAuth("login");
    return false;
  };
  const requireSeller = () => {
    if (!requireUser()) return false;
    if (user?.role !== "seller") {
      setNotice(
        "A seller account is required to list properties. Choose Property seller when creating a test account.",
      );
      return false;
    }
    return true;
  };
  async function save(h: Home) {
    if (!requireUser()) return;
    try {
      await api(
        "/favorites/" + h.id,
        h.saved ? "DELETE" : "POST",
        h.saved ? undefined : {},
      );
      refresh();
      setNotice(
        h.saved ? "Removed from saved homes." : "Home saved to your account.",
      );
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  async function authSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      const x = await api(
        "/auth/" + (auth === "register" ? "register" : "login"),
        "POST",
        data,
      );
      setUser(x.user);
      setAuth("");
      setNotice("You are signed in.");
      refresh();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await api("/auth/logout", "POST", {});
    setUser(null);
    nav("/");
    setNotice("Signed out.");
  }
  function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      q = new URLSearchParams({ kind });
    for (const [k, v] of data) if (v) q.set(k, String(v));
    nav("/all-homes?" + q);
  }
  async function submitProperty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const body = {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        photo:
          uploadedPhoto || String(new FormData(e.currentTarget).get("photo")),
        latitude: point?.[0] ?? null,
        longitude: point?.[1] ?? null,
      };
      const x = await api(
        "/homes" + (editor?.id ? "/" + editor.id : ""),
        editor?.id ? "PUT" : "POST",
        body,
      );
      setEditor(null);
      refresh();
      nav("/home-details/" + (editor?.id || x.id));
      setNotice("Your property has been saved.");
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function inquiry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!requireUser()) return;
    setBusy(true);
    setFormError("");
    try {
      const values = Object.fromEntries(new FormData(e.currentTarget));
      await api("/inquiries", "POST", {
        ...values,
        home_id: detail?.id,
        viewing_at: values.viewing_at
          ? new Date(String(values.viewing_at)).toISOString()
          : null,
      });
      setNotice("Inquiry saved. You can follow it in your inbox.");
      nav("/all-homes?view=inbox");
      refresh();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="demo-strip">
        Portfolio development preview{" "}
        <span>Fictional properties. No real estate transactions.</span>
      </div>
      <header className="header wrap explorer-header">
        <Link className="brand" to="/" aria-label="Real Estate home">
          <span className="brand-icon">
            <House size={21} />
          </span>{" "}
          REAL ESTATE<span className="brand-dot">.</span>
        </Link>
        <nav
          className={menu ? "navigation open" : "navigation"}
          aria-label="Main navigation"
        >
          <Link
            className={kind === "sale" && !view ? "active" : ""}
            to="/all-homes?kind=sale"
          >
            Buy a home
          </Link>
          <Link
            className={kind === "rent" && !view ? "active" : ""}
            to="/all-homes?kind=rent"
          >
            Rent a home
          </Link>
          <button
            onClick={() => {
              if (requireSeller()) {
                setFormError("");
                setEditor({
                  kind: "sale",
                  type: "House",
                  photo: "/property-images/nice-home-9.jpg",
                });
              }
            }}
          >
            List a property
          </button>
          <button
            onClick={() => {
              if (requireUser()) nav("/all-homes?view=saved");
            }}
          >
            Saved homes
          </button>
          <button
            onClick={() => {
              if (requireUser()) nav("/all-homes?view=viewings");
            }}
          >
            Viewings
          </button>
        </nav>
        <div className="account">
          {user ? (
            <>
              <button
                className="icon-button"
                title="Your inbox"
                onClick={() => nav("/all-homes?view=inbox")}
              >
                <Mail size={19} />
              </button>
              <button
                className="account-name"
                onClick={() => nav("/all-homes?view=mine")}
              >
                {user.name.split(" ")[0]}
              </button>
              <button className="icon-button" onClick={logout} title="Sign out">
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <button
              className="outline-button signin"
              onClick={() => {
                setFormError("");
                setAuth("login");
              }}
            >
              Sign in <ArrowUpRight size={15} />
            </button>
          )}
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
        </div>
      </header>
      <main>
        {detailId ? (
          <section className="detail wrap">
            <Link className="back-link" to={"/all-homes?kind=" + kind}>
              <ArrowLeft size={16} /> Back to homes
            </Link>
            {error ? (
              <div className="state error" role="alert">
                {error}
              </div>
            ) : !detail ? (
              <div className="state">Loading property...</div>
            ) : (
              <>
                <div className="detail-title">
                  <div>
                    <p className="eyebrow">
                      {detail.demo
                        ? "FICTIONAL DEMO LISTING"
                        : detail.kind === "rent"
                          ? "FOR RENT"
                          : "FOR SALE"}
                    </p>
                    <h1>{detail.title}</h1>
                    <p className="muted">
                      <MapPin size={16} />
                      {detail.neighborhood}, {detail.city}
                    </p>
                  </div>
                  <div className="detail-price">
                    {money(detail)}
                    {detail.kind === "rent" && <small>/ month</small>}
                  </div>
                </div>
                <img
                  className="detail-image"
                  src={detail.photo}
                  alt={detail.title}
                />
                <div className="detail-grid">
                  <article>
                    <div className="detail-facts">
                      <span>
                        <BedDouble />
                        {detail.beds} bedrooms
                      </span>
                      <span>
                        <Bath />
                        {detail.baths} bathrooms
                      </span>
                      <span>
                        <Maximize />
                        {detail.area} m²
                      </span>
                      <span>
                        <House />
                        {detail.type}
                      </span>
                    </div>
                    <h2>A little about this home</h2>
                    <p className="description">{detail.description}</p>
                    {detail.latitude != null && detail.longitude != null ? (
                      <PropertyMap
                        point={[detail.latitude, detail.longitude]}
                      />
                    ) : (
                      <p className="fine-print">
                        No map pin has been added to this listing.
                      </p>
                    )}
                    {user?.id === detail.owner_id && (
                      <div className="button-row">
                        <button
                          className="outline-button"
                          onClick={() => {
                            setFormError("");
                            setEditor(detail);
                          }}
                        >
                          Edit your listing
                        </button>
                        <button
                          className="text-button"
                          onClick={async () => {
                            if (
                              window.confirm(
                                "Delete this property and its inquiries? This cannot be undone.",
                              )
                            ) {
                              await api("/homes/" + detail.id, "DELETE");
                              nav("/all-homes?view=mine");
                              refresh();
                            }
                          }}
                        >
                          Delete listing
                        </button>
                      </div>
                    )}
                  </article>
                  <aside className="inquiry">
                    <p className="eyebrow">YOUR NEXT STEP</p>
                    <h2>
                      {detail.demo
                        ? "Explore the demo"
                        : user?.id === detail.owner_id
                          ? "Your listing"
                          : "Start a conversation"}
                    </h2>
                    {detail.demo ? (
                      <>
                        <p>
                          This is a sample home, not a real listing. To try
                          messaging and viewing requests, create a listing with
                          one test account and contact it from another.
                        </p>
                        <button
                          className="primary"
                          onClick={() => {
                            if (requireSeller()) {
                              setFormError("");
                              setEditor({
                                kind: "sale",
                                type: "House",
                                photo: "/property-images/nice-home-9.jpg",
                              });
                            }
                          }}
                        >
                          Create a listing <Plus size={16} />
                        </button>
                      </>
                    ) : user?.id === detail.owner_id ? (
                      <>
                        <p>
                          This is your listing. Messages and viewing requests
                          from visitors appear in your inbox.
                        </p>
                        <button
                          className="primary"
                          onClick={() => nav("/all-homes?view=inbox")}
                        >
                          Open inbox <Mail size={16} />
                        </button>
                      </>
                    ) : (
                      <form onSubmit={inquiry}>
                        <p>
                          Contact {detail.owner_name || "the owner"}. Requests
                          stay in the app; no emails or real appointments are
                          sent.
                        </p>
                        <label>
                          Your message
                          <textarea
                            name="message"
                            required
                            minLength={5}
                            maxLength={2000}
                            placeholder="What would you like to know?"
                          />
                        </label>
                        <label>
                          Preferred viewing time (optional)
                          <input type="datetime-local" name="viewing_at" />
                        </label>
                        <small>
                          Time is entered in your device's timezone. A request
                          is not a confirmed appointment.
                        </small>
                        {formError && (
                          <p className="form-error" role="alert">
                            {formError}
                          </p>
                        )}
                        <button className="primary" disabled={busy}>
                          {busy ? "Sending..." : "Send inquiry"}{" "}
                          <ArrowUpRight size={16} />
                        </button>
                      </form>
                    )}
                  </aside>
                </div>
              </>
            )}
          </section>
        ) : view === "viewings" ? (
          <section className="wrap section">
            {user ? (
              <Viewings
                threads={threads}
                userId={user.id}
                onUpdate={async (id, body) => {
                  await api("/inquiries/" + id + "/viewing", "PATCH", body);
                  refresh();
                }}
              />
            ) : (
              <button className="primary" onClick={() => setAuth("login")}>
                Sign in to see your viewings
              </button>
            )}
          </section>
        ) : view === "inbox" ? (
          <section className="wrap section inbox">
            <p className="eyebrow">CONVERSATIONS & VIEWING REQUESTS</p>
            <h1>Your inbox</h1>
            <p className="muted">
              In-app messages only. A viewing request is not a confirmed
              appointment.{" "}
              <Link className="text-link" to="/all-homes?view=viewings">
                Open viewing calendar <CalendarDays size={15} />
              </Link>
            </p>
            {!user ? (
              <button className="primary" onClick={() => setAuth("login")}>
                Sign in to see your inbox
              </button>
            ) : !threads.length ? (
              <div className="state">
                <Mail />
                <h2>No conversations yet</h2>
                <p>Contact a property owner to start a conversation.</p>
              </div>
            ) : (
              threads.map((t) => (
                <article key={t.id} className="thread">
                  <Link to={"/home-details/" + t.home_id}>
                    <h2>
                      {t.title} <ArrowUpRight size={18} />
                    </h2>
                  </Link>
                  <p className="eyebrow">
                    {t.sender_name} TO {t.owner_name}
                  </p>
                  <p>{t.message}</p>
                  {t.viewing_at && (
                    <p className="viewing">
                      <CalendarDays size={16} />
                      Viewing {t.viewing_status}:{" "}
                      {new Date(t.viewing_at).toLocaleString()}
                    </p>
                  )}
                  {t.replies.map((r: any) => (
                    <div className="reply" key={r.id}>
                      <b>{r.name}</b>
                      <p>{r.message}</p>
                    </div>
                  ))}
                  <form
                    className="reply-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = e.currentTarget;
                      try {
                        await api(
                          "/inquiries/" + t.id + "/replies",
                          "POST",
                          Object.fromEntries(new FormData(f)),
                        );
                        f.reset();
                        refresh();
                      } catch (e: any) {
                        setNotice(e.message);
                      }
                    }}
                  >
                    <label className="sr-only" htmlFor={"reply-" + t.id}>
                      Reply to this conversation
                    </label>
                    <input
                      id={"reply-" + t.id}
                      name="message"
                      placeholder="Write a reply..."
                      required
                      maxLength={2000}
                    />
                    <button className="primary">
                      Send <ArrowRight size={16} />
                    </button>
                  </form>
                </article>
              ))
            )}
          </section>
        ) : isHome ? (
          <HomeExplorer
            homes={homes}
            loading={loading}
            error={error}
            kind={kind}
            onKind={(k) => nav("/?kind=" + k)}
            onSave={save}
            onSearch={search}
          />
        ) : (
          <section className="catalog wrap" ref={catalog}>
            <div className="catalog-top">
              <div>
                <p className="eyebrow">
                  {view === "saved"
                    ? "YOUR PERSONAL SHORTLIST"
                    : view === "mine"
                      ? "YOUR PROPERTY COLLECTION"
                      : "FIND YOUR KIND OF PLACE"}
                </p>
                <h2>
                  {view === "saved"
                    ? "Saved for later."
                    : view === "mine"
                      ? "Your listings."
                      : isHome
                        ? "A home for every next step."
                        : "Find your next home."}
                </h2>
              </div>
              {!view && (
                <div className="segmented" aria-label="Property purpose">
                  <button
                    className={kind === "sale" ? "selected" : ""}
                    onClick={() => browse("sale")}
                  >
                    Buy a home
                  </button>
                  <button
                    className={kind === "rent" ? "selected" : ""}
                    onClick={() => browse("rent")}
                  >
                    Rent a home
                  </button>
                </div>
              )}
            </div>
            {!view && (
              <form
                className="search-bar"
                onSubmit={search}
                key={params.toString()}
              >
                <label>
                  <span>
                    <MapPin size={14} /> LOCATION
                  </span>
                  <input
                    name="location"
                    placeholder="City or neighborhood"
                    defaultValue={params.get("location") || ""}
                  />
                </label>
                <label>
                  <span>PROPERTY TYPE</span>
                  <select name="type" defaultValue={params.get("type") || ""}>
                    <option value="">Any property</option>
                    <option>House</option>
                    <option>Apartment</option>
                    <option>Townhouse</option>
                  </select>
                </label>
                <label>
                  <span>MAX. {kind === "rent" ? "MONTHLY RENT" : "PRICE"}</span>
                  <input
                    type="number"
                    name="max"
                    min="1"
                    placeholder="No maximum"
                    defaultValue={params.get("max") || ""}
                  />
                </label>
                <label>
                  <span>BEDROOMS</span>
                  <select name="beds" defaultValue={params.get("beds") || ""}>
                    <option value="">Any number</option>
                    <option value="1">1+</option>
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                    <option value="4">4+</option>
                  </select>
                </label>
                <button className="primary search-button">
                  <Search size={18} /> Search homes
                </button>
              </form>
            )}
            <div className="result-bar">
              <p>
                {loading ? (
                  "Finding homes..."
                ) : (
                  <>
                    <b>{homes.length}</b>{" "}
                    {homes.length === 1 ? "home" : "homes"}{" "}
                    {view === "saved"
                      ? "saved"
                      : view === "mine"
                        ? "listed by you"
                        : params.get("location")
                          ? "matching your search"
                          : "to discover"}
                  </>
                )}
              </p>
              <label className="sort">
                <SlidersHorizontal size={15} />
                <span className="sr-only">Sort homes</span>
                <select
                  value={params.get("sort") || ""}
                  onChange={(e) => {
                    const q = new URLSearchParams(params);
                    q.set("sort", e.target.value);
                    nav("/all-homes?" + q);
                  }}
                >
                  <option value="">Newest first</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                </select>
              </label>
            </div>
            {error ? (
              <div className="state error" role="alert">
                <h3>We couldn't load the homes.</h3>
                <p>{error}</p>
                <button className="outline-button" onClick={refresh}>
                  Try again
                </button>
              </div>
            ) : loading ? (
              <div className="property-grid">
                {[1, 2, 3].map((i) => (
                  <div className="skeleton" key={i} />
                ))}
              </div>
            ) : !homes.length ? (
              <div className="state">
                <Search size={30} />
                <h3>
                  {view === "saved"
                    ? "Your shortlist starts here."
                    : view === "mine"
                      ? "Make room for your first listing."
                      : "No homes match this search."}
                </h3>
                <p>
                  {view
                    ? "Browse homes to save a favorite, or add a property of your own."
                    : "Try another location or a wider price range. We will not show unrelated results."}
                </p>
                <button className="outline-button" onClick={() => browse(kind)}>
                  Reset filters
                </button>
              </div>
            ) : (
              <div className="property-grid">
                {homes.map((h) => (
                  <article className="property" key={h.id}>
                    <div className="property-photo">
                      <Link to={"/home-details/" + h.id}>
                        <img src={h.photo} alt={h.title} loading="lazy" />
                      </Link>
                      <span className="listing-label">
                        {h.kind === "rent" ? "FOR RENT" : "FOR SALE"}
                        {h.demo ? " · DEMO" : ""}
                      </span>
                      <button
                        className={"save-button " + (h.saved ? "saved" : "")}
                        aria-label={
                          h.saved ? "Unsave " + h.title : "Save " + h.title
                        }
                        aria-pressed={!!h.saved}
                        onClick={() => save(h)}
                      >
                        <Heart
                          size={18}
                          fill={h.saved ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                    <div className="property-body">
                      <div className="price-row">
                        <strong>
                          {money(h)}
                          {h.kind === "rent" && <small> / month</small>}
                        </strong>
                        <span>{h.type}</span>
                      </div>
                      <Link to={"/home-details/" + h.id}>
                        <h3>{h.title}</h3>
                      </Link>
                      <p className="address">
                        <MapPin size={14} />
                        {h.neighborhood}, {h.city}
                      </p>
                      <div className="property-facts">
                        <span>
                          <BedDouble size={16} />
                          {h.beds} beds
                        </span>
                        <span>
                          <Bath size={16} />
                          {h.baths} baths
                        </span>
                        <span>
                          <Maximize size={15} />
                          {h.area} m²
                        </span>
                        <Link
                          to={"/home-details/" + h.id}
                          aria-label={"View " + h.title}
                        >
                          <ArrowUpRight size={19} />
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {isHome && (
              <div className="browse-bottom">
                <span>Different homes. The same feeling of possibility.</span>
                <Link className="text-link" to={"/all-homes?kind=" + kind}>
                  Explore all homes <ArrowRight size={16} />
                </Link>
              </div>
            )}
          </section>
        )}
      </main>
      {isHome && (
        <p className="wrap fine-print">
          <a href="/credits.html">Project &amp; photo credits · Demo privacy</a>
        </p>
      )}
      {!isHome && (
        <footer className="footer wrap">
          <Link className="brand" to="/">
            <span className="brand-icon">
              <House size={18} />
            </span>{" "}
            REAL ESTATE.
          </Link>
          <p>A place for your next chapter.</p>
          <span>
            Portfolio demo · USD prices · No real offers ·{" "}
            <a href="/credits.html">Credits &amp; demo privacy</a>
          </span>
        </footer>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
          <button aria-label="Dismiss" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {(auth || editor) && (
        <Modal
          title={
            editor
              ? editor.id
                ? "Edit your listing"
                : "List your property"
              : auth === "register"
                ? "Make yourself at home."
                : "Welcome back."
          }
          close={() => {
            setAuth("");
            setEditor(null);
            setFormError("");
          }}
        >
          {auth ? (
            <>
              <p className="muted">
                {auth === "register"
                  ? "Save homes, list a property, and talk to owners."
                  : "Your homes and conversations, all in one place."}
              </p>
              <form onSubmit={authSubmit} className="stack-form">
                {auth === "register" && (
                  <label>
                    Account type
                    <select name="role">
                      <option value="buyer">Home seeker</option>
                      <option value="seller">Property seller</option>
                    </select>
                  </label>
                )}
                {auth === "register" && (
                  <label>
                    Your name
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="name"
                    />
                  </label>
                )}
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </label>
                <label>
                  Password
                  <input
                    aria-label="Password"
                    name="password"
                    type="password"
                    required
                    minLength={10}
                    maxLength={128}
                    autoComplete={
                      auth === "register" ? "new-password" : "current-password"
                    }
                  />
                  <small>
                    At least 10 characters. Test accounts only in this preview.
                  </small>
                </label>
                {formError && (
                  <p className="form-error" role="alert">
                    {formError}
                  </p>
                )}
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Please wait..."
                    : auth === "register"
                      ? "Create account"
                      : "Sign in"}
                  <ArrowUpRight size={17} />
                </button>
              </form>
              <p className="auth-switch">
                {auth === "register" ? "Already have an account?" : "New here?"}{" "}
                <button
                  onClick={() => {
                    setAuth(auth === "register" ? "login" : "register");
                    setFormError("");
                  }}
                >
                  {auth === "register" ? "Sign in" : "Create an account"}
                </button>
              </p>
              <p className="fine-print">
                Development preview. No email verification or password recovery
                is connected yet. Do not reuse a real password.
              </p>
            </>
          ) : (
            <form onSubmit={submitProperty} className="stack-form editor-form">
              <p className="muted">
                Preview listings are stored in the database. Use fictional
                details only.
              </p>
              <label>
                Property title
                <input
                  name="title"
                  defaultValue={editor?.title}
                  required
                  minLength={5}
                  maxLength={100}
                />
              </label>
              <div className="form-grid">
                <label>
                  City
                  <input
                    name="city"
                    defaultValue={editor?.city}
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </label>
                <label>
                  Neighborhood
                  <input
                    name="neighborhood"
                    defaultValue={editor?.neighborhood}
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </label>
                <label>
                  Listing for
                  <select name="kind" defaultValue={editor?.kind}>
                    <option value="sale">Sale</option>
                    <option value="rent">Rent</option>
                  </select>
                </label>
                <label>
                  Property type
                  <select name="type" defaultValue={editor?.type}>
                    <option>House</option>
                    <option>Apartment</option>
                    <option>Townhouse</option>
                  </select>
                </label>
                <label>
                  Price in USD
                  <input
                    name="price"
                    type="number"
                    min="1"
                    max="1000000000"
                    defaultValue={editor?.price}
                    required
                  />
                </label>
                <label>
                  Area (m²)
                  <input
                    name="area"
                    type="number"
                    min="1"
                    max="100000"
                    defaultValue={editor?.area}
                    required
                  />
                </label>
                <label>
                  Bedrooms
                  <input
                    name="beds"
                    type="number"
                    min="0"
                    max="30"
                    defaultValue={editor?.beds}
                    required
                  />
                </label>
                <label>
                  Bathrooms
                  <input
                    name="baths"
                    type="number"
                    min="1"
                    max="30"
                    defaultValue={editor?.baths}
                    required
                  />
                </label>
              </div>
              <label>
                Sample photo
                <select name="photo" defaultValue={editor?.photo}>
                  {[
                    "nice-home-9.jpg",
                    "nice-home-2.jpg",
                    "nice-home-6.jpg",
                    "nice-home-4.jpg",
                    "nice-home-10.jpg",
                    "nice-home-12.jpg",
                  ].map((f, i) => (
                    <option key={f} value={"/property-images/" + f}>
                      Property photo {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Or upload a property photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5000000) {
                      setFormError("Choose an image smaller than 5MB.");
                      return;
                    }
                    setBusy(true);
                    setFormError("");
                    try {
                      const bitmap = await createImageBitmap(file);
                      const canvas = document.createElement("canvas");
                      const factor = Math.min(
                        1,
                        1800 / Math.max(bitmap.width, bitmap.height),
                      );
                      canvas.width = Math.round(bitmap.width * factor);
                      canvas.height = Math.round(bitmap.height * factor);
                      canvas
                        .getContext("2d")!
                        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                      bitmap.close();
                      const result = await api("/photos", "POST", {
                        image: canvas.toDataURL("image/jpeg", 0.8),
                      });
                      setUploadedPhoto(result.photo);
                    } catch (err: any) {
                      setFormError(
                        err.message || "Image could not be uploaded.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                <small>
                  JPEG, PNG or WebP, up to 5MB. Resized to JPEG with metadata
                  removed before upload.
                </small>
              </label>
              {uploadedPhoto && (
                <div className="uploaded-preview">
                  <img src={uploadedPhoto} alt="Your uploaded property" />
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setUploadedPhoto("")}
                  >
                    Use a sample photo instead
                  </button>
                </div>
              )}
              <PropertyMap point={point} onPick={setPoint} />
              <label>
                Description
                <textarea
                  name="description"
                  defaultValue={editor?.description}
                  required
                  minLength={20}
                  maxLength={3000}
                />
              </label>
              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy ? "Saving..." : "Save listing"} <Check size={17} />
              </button>
              <p className="fine-print">
                Only seller accounts can publish listings. A map pin is
                optional; use fictional details in this preview.
              </p>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
