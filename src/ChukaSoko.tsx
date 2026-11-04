import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { ArrowLeft, CheckCircle2, ImagePlus, LoaderCircle, PackagePlus, Search, ShieldCheck, ShoppingBag, Star, UploadCloud, Users } from "lucide-react";
import "./ChukaSoko.css";

const ADMIN_EMAIL = "sidneywafula30@gmail.com";
const API_URL = (import.meta.env.VITE_CHUKA_SOKO_API_URL || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chuka-soko-api`).replace(/\/$/, "");
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

type SokoImage = { driveFileId?: string; fileName?: string; driveUrl?: string; url?: string };
type Product = {
  productId: string; sellerId: string; title: string; category: string; description: string;
  price: number; currency?: string; condition?: string; location?: string; deliveryOptions?: string;
  availability?: string; featured?: boolean | string; contact?: { whatsapp?: string; phone?: string };
  images?: SokoImage[]; status?: string;
};
type Category = { categoryId: string; name: string };
type Seller = { sellerId: string; fullName: string; phone?: string; whatsappNumber?: string; location?: string; status?: string };
type Commission = { commissionId: string; productId: string; sellerId: string; amount: number; currency?: string; paymentStatus?: string; listingPrice?: number };
type AdminData = { sellers: Seller[]; products: Product[]; commissions: Commission[]; payments: Record<string, unknown>[] };

type Props = { user: User | null; onSignIn: () => void; onBack: () => void };

async function publicRequest(action: string, params: Record<string, string> = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url.toString(), { headers: SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {} });
  const raw = await response.text();
  let result: any;
  try { result = JSON.parse(raw); }
  catch {
    const preview = raw.replace(/\s+/g, " ").slice(0, 180);
    throw new Error(`Chuka Soko API returned HTML or invalid JSON (HTTP ${response.status}). Check the Supabase function URL and deployment. Response: ${preview}`);
  }
  if (!response.ok || result.success === false || result.error) throw new Error(result.error || "Chuka Soko is temporarily unavailable.");
  return result.data;
}

async function adminRequest(user: User, action: string, payload: Record<string, unknown> = {}) {
  const token = await user.getIdToken();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}) },
    body: JSON.stringify({ action, payload }),
  });
  const raw = await response.text();
  let result: any;
  try { result = JSON.parse(raw); }
  catch {
    const preview = raw.replace(/\s+/g, " ").slice(0, 180);
    throw new Error(`Chuka Soko admin API returned HTML or invalid JSON (HTTP ${response.status}). Check the deployed chuka-soko-api Edge Function and its Apps Script URL. Response: ${preview}`);
  }
  if (!response.ok || result.success === false || result.error) throw new Error(result.error || "The admin request could not be completed.");
  return result.data;
}

function imageUrl(image: SokoImage) {
  const stored = image.driveUrl || image.url || "";
  const id = image.driveFileId || stored.match(/[?&]id=([^&]+)/)?.[1];
  // Drive thumbnail endpoint is more reliable for <img> than the preview UI URL.
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200` : stored;
}
function money(value: number, currency = "KES") { return `${currency === "KES" ? "KSh" : currency} ${Number(value || 0).toLocaleString("en-KE")}`; }

export default function ChukaSoko({ user, onSignIn, onBack }: Props) {
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;
  const [view, setView] = useState<"market" | "admin">("market");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [config, setConfig] = useState<{ adminWhatsApp?: string; sellersWhatsAppGroupUrl?: string; currency?: string }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [adminData, setAdminData] = useState<AdminData>({ sellers: [], products: [], commissions: [], payments: [] });
  const [adminLoading, setAdminLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [sellerForm, setSellerForm] = useState({ fullName: "", phone: "", whatsappNumber: "", location: "" });
  const [productForm, setProductForm] = useState({ sellerId: "", title: "", category: "", description: "", price: "", condition: "New", location: "", deliveryOptions: "Meet-up / collection", preferredContact: "both", whatsappConsent: true, callConsent: false });
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [paymentRefs, setPaymentRefs] = useState<Record<string, string>>({});
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});

  const loadPublic = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [productData, categoryData, configData] = await Promise.all([
        publicRequest("products"), publicRequest("categories"), publicRequest("publicConfig"),
      ]);
      setProducts(Array.isArray(productData) ? productData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setConfig(configData || {});
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load Chuka Soko."); }
    finally { setLoading(false); }
  }, []);

  const loadAdmin = useCallback(async () => {
    if (!user || !isAdmin) return;
    setAdminLoading(true); setError("");
    try { setAdminData(await adminRequest(user, "adminData")); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load the admin dashboard."); }
    finally { setAdminLoading(false); }
  }, [user, isAdmin]);

  useEffect(() => { void loadPublic(); }, [loadPublic]);
  useEffect(() => { if (view === "admin") void loadAdmin(); }, [view, loadAdmin]);

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === "All" || product.category === category;
    const search = `${product.title} ${product.description} ${product.location} ${product.category}`.toLowerCase();
    return matchesCategory && search.includes(query.toLowerCase());
  }), [products, category, query]);

  async function submitSeller(event: FormEvent) {
    event.preventDefault(); if (!user) return;
    setSaving(true); setNotice(""); setError("");
    try {
      await adminRequest(user, "createSeller", sellerForm);
      setSellerForm({ fullName: "", phone: "", whatsappNumber: "", location: "" });
      setNotice("Seller added and approved."); await loadAdmin();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add seller."); }
    finally { setSaving(false); }
  }

  function selectImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
    setImageFiles(selected.slice(0, 6));
    if (selected.length > 6) setNotice("Only the first six images were selected.");
  }

  async function submitProduct(event: FormEvent) {
    event.preventDefault(); if (!user) return;
    if (imageFiles.length < 1) { setError("Upload at least one product image before creating the listing."); return; }
    if (imageFiles.some((file) => file.size > 5 * 1024 * 1024)) { setError("Each product image must be 5 MB or smaller."); return; }
    setSaving(true); setNotice(""); setError("");
    try {
      const images = await Promise.all(imageFiles.map(async (file) => ({
        name: file.name, mimeType: file.type,
        data: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(new Error("Could not read one of the selected images.")); reader.readAsDataURL(file);
        }),
      })));
      const payload = { ...productForm, price: Number(productForm.price), images };
      const result = await adminRequest(user, "createProduct", payload);
      setProductForm({ sellerId: "", title: "", category: "", description: "", price: "", condition: "New", location: "", deliveryOptions: "Meet-up / collection", preferredContact: "both", whatsappConsent: true, callConsent: false });
      setImageFiles([]);
      setNotice(`Listing created. Commission due: ${money(Number(result.commissionAmount || 0))}. It will appear publicly after M-Pesa payment is verified.`);
      await loadAdmin();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create the product listing."); }
    finally { setSaving(false); }
  }

  async function verifyPayment(commission: Commission) {
    if (!user) return;
    setSaving(true); setNotice(""); setError("");
    try {
      await adminRequest(user, "verifyCommission", { commissionId: commission.commissionId, mpesaReference: paymentRefs[commission.commissionId] || "", amount: Number(paymentAmounts[commission.commissionId] || commission.amount) });
      setNotice("Commission payment verified. The product listing is now activated."); await loadAdmin(); await loadPublic();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not verify payment."); }
    finally { setSaving(false); }
  }

  async function changeAvailability(productId: string, availability: string) {
    if (!user) return;
    setSaving(true); setError(""); setNotice("");
    try { await adminRequest(user, "updateAvailability", { productId, availability }); setNotice("Product availability updated."); await loadAdmin(); await loadPublic(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update availability."); }
    finally { setSaving(false); }
  }

  async function toggleFeatured(product: Product) {
    if (!user) return;
    setSaving(true); setError(""); setNotice("");
    try { await adminRequest(user, "setFeatured", { productId: product.productId, featured: !(product.featured === true || product.featured === "TRUE" || product.featured === "true") }); setNotice("Featured status updated."); await loadAdmin(); await loadPublic(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update featured status."); }
    finally { setSaving(false); }
  }

  return (
    <section className="soko-shell">
      <div className="soko-topbar">
        <button className="soko-back" onClick={onBack}><ArrowLeft size={17}/> Back to communities</button>
        <div className="soko-brand"><span><ShoppingBag size={20}/></span><div><strong>Chuka Soko</strong><small>Campus marketplace</small></div></div>
        {isAdmin ? <button className="soko-admin-switch" onClick={() => setView(view === "admin" ? "market" : "admin")}><ShieldCheck size={16}/>{view === "admin" ? "Marketplace" : "Admin dashboard"}</button> : <span className="soko-currency">KES</span>}
      </div>

      {view === "market" ? <>
        <div className="soko-hero"><div><span className="soko-kicker">BUY • SELL • CONNECT</span><h1>Find what you need.<br/><em>Sell what you have.</em></h1><p>Discover products and services shared by the Chuka community. Contact sellers directly to arrange your purchase.</p><div className="soko-support-links">{config.adminWhatsApp && <a href={`https://wa.me/${config.adminWhatsApp}`} target="_blank" rel="noreferrer">Seller support on WhatsApp</a>}{config.sellersWhatsAppGroupUrl && <a href={config.sellersWhatsAppGroupUrl} target="_blank" rel="noreferrer">Join sellers' group</a>}</div></div><div className="soko-hero-art"><ShoppingBag size={74}/><span>Chuka community marketplace</span></div></div>
        <div className="soko-market-tools"><label className="soko-search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products, services or location"/></label><div className="soko-categories"><button className={category === "All" ? "selected" : ""} onClick={() => setCategory("All")}>All</button>{categories.map((item) => <button key={item.categoryId} className={category === item.name ? "selected" : ""} onClick={() => setCategory(item.name)}>{item.name}</button>)}</div></div>
        {error && <p className="soko-alert error">{error}</p>}
        {loading ? <div className="soko-loading"><LoaderCircle className="spin"/> Loading listings…</div> : visibleProducts.length ? <div className="soko-product-grid">{visibleProducts.map((product) => <article className="soko-product-card" key={product.productId}><div className="soko-product-image">{product.images?.[0] && imageUrl(product.images[0]) ? <img src={imageUrl(product.images[0])} alt={product.title} loading="lazy"/> : <div className="soko-image-placeholder"><ShoppingBag size={30}/><small>Product photo</small></div>}{product.featured && <span className="soko-featured"><Star size={12} fill="currentColor"/> Featured</span>}{product.availability === "Sold Out" && <span className="soko-sold">Sold out</span>}</div><div className="soko-product-copy"><span className="soko-product-category">{product.category}</span><h3>{product.title}</h3><strong className="soko-price">{money(product.price, product.currency || "KES")}</strong>{product.description && <p>{product.description}</p>}<div className="soko-product-meta"><span>{product.condition || "Condition not specified"}</span><span>{product.location}</span></div>{product.availability && <small className="soko-availability">{product.availability}</small>}<div className="soko-contact-actions">{product.contact?.whatsapp && <a href={`https://wa.me/${product.contact.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp seller</a>}{product.contact?.phone && <a href={`tel:${product.contact.phone}`}>Call seller</a>}</div></div></article>)}</div> : <div className="soko-empty"><ShoppingBag size={34}/><h3>No products listed yet</h3><p>New approved listings will appear here when sellers' products are added by the Chuka Soko admin.</p></div>}
        <div className="soko-notice"><ShieldCheck size={17}/><span>Buyers and sellers arrange payment and delivery directly. Chuka Soko collects a one-time 10% listing commission from sellers; it does not handle buyer payments or completed sales.</span></div>
      </> : <div className="soko-admin-page">
        <div className="soko-admin-heading"><span className="soko-kicker">RESTRICTED ADMIN AREA</span><h1>Chuka Soko dashboard</h1><p>Signed in as {user?.email}. Only the approved administrator can manage listings and payments.</p></div>
        {!user ? <div className="soko-empty"><ShieldCheck size={34}/><h3>Admin sign-in required</h3><button onClick={onSignIn}>Sign in with Google</button></div> : <>
          {error && <p className="soko-alert error">{error}</p>}{notice && <p className="soko-alert success"><CheckCircle2 size={16}/>{notice}</p>}
          <div className="soko-stat-grid"><div><Users/><strong>{adminData.sellers.length}</strong><small>Sellers</small></div><div><ShoppingBag/><strong>{adminData.products.length}</strong><small>Products</small></div><div><PackagePlus/><strong>{adminData.commissions.filter((item) => item.paymentStatus !== "paid").length}</strong><small>Commissions awaiting verification</small></div></div>
          {adminLoading && <div className="soko-loading"><LoaderCircle className="spin"/> Loading admin data…</div>}
          <div className="soko-admin-grid">
            <form className="soko-admin-card" onSubmit={submitSeller}><h2><Users size={19}/> Add approved seller</h2><p>Only add sellers whose details have been reviewed and approved.</p><label>Seller full name<input required value={sellerForm.fullName} onChange={(e) => setSellerForm({...sellerForm, fullName:e.target.value})}/></label><label>Phone number<input required value={sellerForm.phone} onChange={(e) => setSellerForm({...sellerForm, phone:e.target.value})}/></label><label>WhatsApp number<input value={sellerForm.whatsappNumber} onChange={(e) => setSellerForm({...sellerForm, whatsappNumber:e.target.value})}/></label><label>Location<input required value={sellerForm.location} onChange={(e) => setSellerForm({...sellerForm, location:e.target.value})}/></label><button className="soko-primary" disabled={saving}>{saving ? "Saving…" : "Add approved seller"}</button></form>
            <form className="soko-admin-card soko-product-form" onSubmit={submitProduct}><h2><PackagePlus size={19}/> Create product listing</h2><p>Seller photos are supplied to the admin through WhatsApp. Upload at least one photo before saving.</p><label>Approved seller<select required value={productForm.sellerId} onChange={(e) => setProductForm({...productForm,sellerId:e.target.value})}><option value="">Select seller</option>{adminData.sellers.filter((seller) => seller.status === "approved").map((seller) => <option key={seller.sellerId} value={seller.sellerId}>{seller.fullName} — {seller.location}</option>)}</select></label><label>Product name<input required value={productForm.title} onChange={(e) => setProductForm({...productForm,title:e.target.value})}/></label><label>Category<select required value={productForm.category} onChange={(e) => setProductForm({...productForm,category:e.target.value})}><option value="">Choose category</option>{categories.map((item) => <option key={item.categoryId} value={item.name}>{item.name}</option>)}</select></label><label>Description<textarea required rows={3} value={productForm.description} onChange={(e) => setProductForm({...productForm,description:e.target.value})}/></label><div className="soko-form-row"><label>Advertised price (KSh)<input required type="number" min="1" step="1" value={productForm.price} onChange={(e) => setProductForm({...productForm,price:e.target.value})}/></label><label>Condition<select value={productForm.condition} onChange={(e) => setProductForm({...productForm,condition:e.target.value})}><option>New</option><option>Used - like new</option><option>Used - good</option><option>Refurbished</option></select></label></div><label>Location<input required value={productForm.location} onChange={(e) => setProductForm({...productForm,location:e.target.value})}/></label><label>Delivery / collection information<input value={productForm.deliveryOptions} onChange={(e) => setProductForm({...productForm,deliveryOptions:e.target.value})}/></label><label>Preferred contact<select value={productForm.preferredContact} onChange={(e) => setProductForm({...productForm,preferredContact:e.target.value})}><option value="whatsapp">WhatsApp</option><option value="call">Call</option><option value="both">WhatsApp and call</option></select></label><div className="soko-consent-row"><label><input type="checkbox" checked={productForm.whatsappConsent} onChange={(e) => setProductForm({...productForm,whatsappConsent:e.target.checked})}/> Seller consents to WhatsApp display</label><label><input type="checkbox" checked={productForm.callConsent} onChange={(e) => setProductForm({...productForm,callConsent:e.target.checked})}/> Seller consents to phone display</label></div><label className="soko-upload"><UploadCloud size={22}/><strong>Upload product images *</strong><span>JPG, PNG or WEBP · up to 5 MB each · at least one required</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectImages}/></label>{imageFiles.length > 0 && <div className="soko-selected-files"><ImagePlus size={15}/>{imageFiles.map((file) => file.name).join(" · ")}</div>}{productForm.price && <div className="soko-commission-preview">One-time listing commission (10%): <strong>{money(Number(productForm.price) * 0.1)}</strong></div>}<button className="soko-primary" disabled={saving || adminData.sellers.filter((seller) => seller.status === "approved").length === 0}>{saving ? "Saving listing…" : "Create listing and commission"}</button></form>
          </div>
          <section className="soko-admin-card soko-commission-list"><h2><ShieldCheck size={19}/> Verify listing commissions</h2><p>Check the official M-Pesa Till statement before marking a payment as verified. Successful verification activates the listing.</p>{adminData.commissions.filter((item) => item.paymentStatus !== "paid").length === 0 ? <div className="soko-inline-empty">No pending listing commissions.</div> : adminData.commissions.filter((item) => item.paymentStatus !== "paid").map((commission) => <div className="soko-commission-row" key={commission.commissionId}><div><strong>{adminData.products.find((product) => product.productId === commission.productId)?.title || commission.productId}</strong><small>Listing price: {money(Number(commission.listingPrice || 0))}</small><b>{money(Number(commission.amount || 0))} due</b></div><label>M-Pesa code<input value={paymentRefs[commission.commissionId] || ""} onChange={(e) => setPaymentRefs({...paymentRefs,[commission.commissionId]:e.target.value.toUpperCase()})} placeholder="e.g. QAB123XYZ"/></label><label>Amount received<input type="number" min="1" value={paymentAmounts[commission.commissionId] ?? String(commission.amount)} onChange={(e) => setPaymentAmounts({...paymentAmounts,[commission.commissionId]:e.target.value})}/></label><button disabled={saving || !paymentRefs[commission.commissionId]?.trim()} onClick={() => void verifyPayment(commission)}>Verify & activate</button></div>)}</section>
          <section className="soko-admin-card soko-product-admin-list"><h2><ShoppingBag size={19}/> Manage products</h2>{adminData.products.length === 0 ? <div className="soko-inline-empty">No products have been created yet.</div> : adminData.products.map((product) => <div className="soko-manage-product" key={product.productId}><div>{product.images?.[0] && <img src={imageUrl(product.images[0])} alt=""/>}<span><strong>{product.title}</strong><small>{money(Number(product.price || 0))} · {product.status}</small></span></div><select value={product.availability || "In Stock"} onChange={(e) => void changeAvailability(product.productId,e.target.value)} disabled={saving}><option>In Stock</option><option>Sold Out</option><option>Paused</option><option>Removed</option></select><button className={product.featured ? "featured-on" : ""} onClick={() => void toggleFeatured(product)} disabled={saving}><Star size={14}/>{product.featured ? "Featured" : "Feature"}</button></div>)}</section>
        </>}
      </div>}
    </section>
  );
}
