import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Search,
  Heart,
  MapPin,
  SlidersHorizontal,
  BedDouble,
  Bath,
  Maximize,
} from "lucide-react";
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
};
export default function HomeExplorer({
  homes,
  loading,
  error,
  kind,
  onKind,
  onSave,
  onSearch,
}: {
  homes: Home[];
  loading: boolean;
  error: string;
  kind: string;
  onKind: (k: string) => void;
  onSave: (h: Home) => void;
  onSearch: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [index, setIndex] = useState(0),
    [filters, setFilters] = useState(false);
  useEffect(() => setIndex(0), [kind]);
  const ordered = [...homes].reverse(),
    h = ordered[index] || ordered[0];
  const change = (delta: number) =>
    setIndex((i) => (i + delta + ordered.length) % ordered.length);
  return (
    <section className="space-explorer">
      <div className="explorer-tools">
        <div className="explorer-intro">
          <span className="live-dot" /> THE PROPERTY EDIT{" "}
          <span className="explorer-subtitle">
            Spaces with a different point of view.
          </span>
        </div>
        <div className="explorer-purpose">
          <button
            onClick={() => onKind("sale")}
            className={kind === "sale" ? "chosen" : ""}
          >
            Buy
          </button>
          <button
            onClick={() => onKind("rent")}
            className={kind === "rent" ? "chosen" : ""}
          >
            Rent
          </button>
          <button onClick={() => setFilters(!filters)} aria-expanded={filters}>
            <SlidersHorizontal size={15} /> Refine your search
          </button>
        </div>
      </div>
      {filters && (
        <form className="explorer-filters" onSubmit={onSearch}>
          <label>
            LOCATION
            <input name="location" placeholder="City or neighborhood" />
          </label>
          <label>
            MAX. PRICE (USD)
            <input name="max" type="number" min="1" placeholder="No maximum" />
          </label>
          <label>
            PROPERTY TYPE
            <select name="type">
              <option value="">Any property</option>
              <option>House</option>
              <option>Apartment</option>
              <option>Townhouse</option>
            </select>
          </label>
          <button className="primary">
            <Search size={17} /> Find your place
          </button>
        </form>
      )}
      {loading ? (
        <div className="explorer-loading">
          Finding a different perspective...
        </div>
      ) : error ? (
        <div className="explorer-loading">{error}</div>
      ) : !h ? (
        <div className="explorer-loading">No homes to discover yet.</div>
      ) : (
        <>
          <div className="explorer-stage">
            <div className="explorer-scene" key={h.id}>
              <img src={h.photo} alt={h.title} />
              <div className="explorer-scrim" />
              <div className="scene-top">
                <span>
                  {String(index + 1).padStart(2, "0")} /{" "}
                  {String(ordered.length).padStart(2, "0")}
                </span>
                <span>
                  {h.demo
                    ? "FICTIONAL PORTFOLIO PROPERTY"
                    : h.kind === "sale"
                      ? "FOR SALE"
                      : "FOR RENT"}
                </span>
              </div>
              <div className="scene-coordinate">A NEW WAY TO COME HOME</div>
              <div className="scene-title">
                <p>
                  <MapPin size={14} />
                  {h.neighborhood}, {h.city}
                </p>
                <h1>{h.title}</h1>
                <div className="scene-bottom">
                  <span>
                    SEE THE SPACE.
                    <br />
                    FEEL THE POSSIBILITY.
                  </span>
                  <Link
                    to={"/home-details/" + h.id}
                    className="scene-enter"
                    aria-label={"Step inside " + h.title}
                  >
                    <ArrowUpRight size={28} />
                  </Link>
                </div>
              </div>
              <button
                className={"scene-save " + (h.saved ? "saved" : "")}
                onClick={() => onSave(h)}
                aria-label={h.saved ? "Unsave " + h.title : "Save " + h.title}
              >
                <Heart size={19} fill={h.saved ? "currentColor" : "none"} />
              </button>
            </div>
            <aside className="explorer-summary">
              <div className="summary-heading">
                <span>IN FOCUS</span>
                <span>{h.type.toUpperCase()}</span>
              </div>
              <div className="summary-title">
                <p>{h.city}</p>
                <h2>
                  Not just an address.
                  <br />
                  <i>A different everyday.</i>
                </h2>
              </div>
              <div className="summary-price">
                <span>
                  {h.kind === "rent" ? "MONTHLY RENT" : "ASKING PRICE"} · USD
                </span>
                <strong>
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(h.price)}
                </strong>
              </div>
              <div className="summary-facts">
                <div>
                  <BedDouble size={19} />
                  <b>{h.beds}</b>
                  <span>Bedrooms</span>
                </div>
                <div>
                  <Bath size={19} />
                  <b>{h.baths}</b>
                  <span>Bathrooms</span>
                </div>
                <div>
                  <Maximize size={18} />
                  <b>{h.area}</b>
                  <span>Square meters</span>
                </div>
              </div>
              <Link
                className="explorer-detail-link"
                to={"/home-details/" + h.id}
              >
                Step inside <ArrowUpRight size={19} />
              </Link>
              <p className="summary-note">
                {h.demo
                  ? "A fictional property, thoughtfully presented. Explore the working demo without real offers or commitments."
                  : "A listing from a demo seller. Contact them inside the app to explore its details."}
              </p>
              <div className="explorer-pagination">
                <div>
                  <span>KEEP EXPLORING</span>
                  <b>
                    {String(index + 1).padStart(2, "0")}{" "}
                    <small>/ {String(ordered.length).padStart(2, "0")}</small>
                  </b>
                </div>
                <div>
                  <button
                    aria-label="Previous property"
                    onClick={() => change(-1)}
                  >
                    <ArrowLeft size={19} />
                  </button>
                  <button aria-label="Next property" onClick={() => change(1)}>
                    <ArrowRight size={19} />
                  </button>
                </div>
              </div>
            </aside>
          </div>
          <div className="explorer-bottom">
            <p>
              GOOD SPACES.
              <br />
              <b>UNEXPECTED POSSIBILITIES.</b>
            </p>
            <div className="property-strip">
              {ordered.map((p, i) => (
                <button
                  key={p.id}
                  className={i === index ? "selected-property" : ""}
                  onClick={() => setIndex(i)}
                  aria-label={"Explore " + p.title}
                >
                  <img src={p.photo} alt="" />
                  <span>
                    <small>
                      {String(i + 1).padStart(2, "0")} / {p.city}
                    </small>
                    <b>{p.title}</b>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
            <Link className="all-spaces" to={"/all-homes?kind=" + kind}>
              ALL SPACES <ArrowUpRight size={19} />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
