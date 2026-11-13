"use strict";
const SUPABASE_URL="https://shdstohkbpvoxjtghsob.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_Izj2iOacJqMcoso2OeLyzA_gghnKnxo";
let db=null;
function getDb(){
 if(!window.supabase?.createClient)throw new Error("The Supabase library did not load. Check your connection and refresh.");
 if(!db)db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
 return db;
}
let products=[],cart=[],activeCategory="All",searchText="",sortMode="featured",promoIndex=0,promoTimer,activeProduct=null,productVariants=[],selectedVariant=null,selectedQuantity=1;
const get=id=>document.getElementById(id);
const money=n=>"₦"+Number(n||0).toLocaleString("en-NG");
const categoryKey=v=>{v=String(v||"").trim().toLowerCase();return ["clothes","clothings","apparel"].includes(v)?"clothing":v};
function message(text){const box=get("product-grid");if(!box)return;box.replaceChildren();const p=document.createElement("p");p.className="empty-products";p.textContent=text;box.append(p)}
async function loadProducts(){try{const {data,error}=await getDb().from("products").select("*").eq("Is_active",true);if(error)throw error;products=data||[];try{const ids=products.map(p=>p.id);if(ids.length){const v=await getDb().from("product_variants").select("id,product_id,color,size,stock_quantity,price,compare_at_price,sku,is_active").in("product_id",ids).eq("is_active",true).gt("stock_quantity",0);if(v.error)throw v.error;productVariants=v.data||[]}}catch(variantError){console.warn("Variant inventory is unavailable; showing standard product listings.",variantError);productVariants=[]}renderProducts();renderHomeCollections();loadHomepageReviews()}catch(e){console.error(e);message("Products could not load. Please refresh and try again.")}}
function renderProducts(){const box=get("product-grid");if(!box)return;box.replaceChildren();let list=products.filter(p=>(activeCategory==="All"||categoryKey(p.Category)===categoryKey(activeCategory))&&[p.Name,p.Category,p.Description].join(" ").toLowerCase().includes(searchText));if(sortMode==="low")list.sort((a,b)=>Number(a.Price)-Number(b.Price));else if(sortMode==="high")list.sort((a,b)=>Number(b.Price)-Number(a.Price));else if(activeCategory==="All")list.sort((a,b)=>(Date.parse(b.created_at||b.createdAt||"")||0)-(Date.parse(a.created_at||a.createdAt||"")||0));if(!list.length){message(products.length?"No products match your selection.":"No active products yet. Please check back soon.");return}
list.forEach(p=>{const card=document.createElement("article");card.className="product-card";card.tabIndex=0;const art=document.createElement("div");art.className="product-art";if(p.Image_Url){const img=document.createElement("img");img.src=p.Image_Url;img.alt=p.Name||"KENNIX product";img.loading="lazy";img.onerror=()=>{img.remove();art.textContent="KENNIX"};art.append(img)}else art.textContent="KENNIX";const tag=document.createElement("span");tag.className="product-tag";tag.textContent=p.Category||"KENNIX";const add=document.createElement("button");add.className="add-btn";add.type="button";add.textContent="+";add.setAttribute("aria-label","Add to bag");add.addEventListener("click",e=>{e.stopPropagation();openProduct(p)});art.append(tag,add);const info=document.createElement("div");info.className="product-info";const d=document.createElement("div");const name=document.createElement("h3");name.textContent=p.Name||"Unnamed product";const desc=document.createElement("p");desc.textContent=p.Description||"";d.append(name,desc);const price=document.createElement("span");price.className="price";price.innerHTML=p.compare_at_price?`<span class="old-price">${money(p.compare_at_price)}</span><span class="sale-price">${money(p.Price)}</span><small class="discount-pill">13% OFF</small>`:money(p.Price);info.append(d,price);card.append(art,info);card.addEventListener("click",()=>openProduct(p));card.addEventListener("keydown",e=>{if(e.key==="Enter")openProduct(p)});box.append(card)})}

function renderHomeCollections(){
 const makeCard=p=>{
  const card=document.createElement("article");card.className="collection-card";card.tabIndex=0;
  if(p.Image_Url){const img=document.createElement("img");img.src=p.Image_Url;img.alt=p.Name||"KENNIX product";img.loading="lazy";card.append(img)}
  else{const ph=document.createElement("div");ph.className="collection-placeholder";ph.textContent="KENNIX";card.append(ph)}
  const info=document.createElement("div");info.className="collection-card-info";
  const cat=document.createElement("small");cat.textContent=p.Category||"KENNIX";
  const name=document.createElement("h4");name.textContent=p.Name||"Product";
  const price=document.createElement("strong");price.textContent=money(p.Price);
  info.append(cat,name,price);
  if(p.compare_at_price){const old=document.createElement("del");old.textContent=money(p.compare_at_price);info.insertBefore(old,price)}
  card.append(info);card.addEventListener("click",()=>openProduct(p));card.addEventListener("keydown",e=>{if(e.key==="Enter")openProduct(p)});
  return card;
 };
 const shelves=[
  ["new-arrivals-grid",[...products].sort((a,b)=>(Date.parse(b.created_at||b.createdAt||"")||0)-(Date.parse(a.created_at||a.createdAt||"")||0)).slice(0,8),"No new arrivals yet."],
  ["featured-picks-grid",[...products].slice(0,8),"No featured products yet."],
  ["special-offers-grid",products.filter(p=>Number(p.compare_at_price)>Number(p.Price)),"No special offers at the moment."]
 ];
 shelves.forEach(([id,list,empty])=>{
  const box=get(id);if(!box)return;box.replaceChildren();box.classList.add("collection-carousel");
  if(!list.length){const p=document.createElement("p");p.textContent=empty;box.append(p);return}
  list.forEach(p=>box.append(makeCard(p)));
  if(list.length>2){
   const controls=document.createElement("div");controls.className="collection-carousel-controls";
   const prev=document.createElement("button");prev.type="button";prev.textContent="←";prev.setAttribute("aria-label","Previous products");
   const next=document.createElement("button");next.type="button";next.textContent="→";next.setAttribute("aria-label","Next products");
   const dots=document.createElement("span");dots.className="carousel-position";dots.textContent="1 / "+list.length;
   controls.append(prev,dots,next);box.insertAdjacentElement("afterend",controls);
   let index=0,timer;
   const step=()=>Math.max(1,box.firstElementChild?.getBoundingClientRect().width+12||200);
   const update=()=>{index=Math.max(0,Math.min(list.length-1,Math.round(box.scrollLeft/step())));dots.textContent=(index+1)+" / "+list.length};
   const move=dir=>{box.scrollBy({left:dir*step(),behavior:"smooth"});};
   prev.addEventListener("click",()=>move(-1));next.addEventListener("click",()=>move(1));
   box.addEventListener("scroll",()=>{update();},{passive:true});
   const start=()=>{clearInterval(timer);timer=setInterval(()=>{if(box.matches(":hover")||box.contains(document.activeElement))return;const max=box.scrollWidth-box.clientWidth;if(box.scrollLeft>=max-4)box.scrollTo({left:0,behavior:"smooth"});else move(1)},3000)};
   ["pointerdown","touchstart","focusin"].forEach(ev=>box.addEventListener(ev,()=>clearInterval(timer),{passive:true}));
   ["pointerup","touchend","focusout"].forEach(ev=>box.addEventListener(ev,start,{passive:true}));
   start();
  }
 });
 setupCategoryPhotos();
}
function setupCategoryPhotos(){
 const categories=[["Clothes",["clothing","clothes","apparel"]],["Shoes",["shoes","footwear"]],["Bags",["bags","bag"]],["Accessories",["accessories","accessory"]],["Phones",["phones","phone"]],["Phone Accessories",["phone accessories","phone accessory"]],["Networking & Internet",["networking & internet","networking","internet"]],["Power & Energy",["power & energy","power","energy"]],["Home Appliances",["home appliances","appliances"]]];
 document.querySelectorAll(".category-strip a[data-filter]").forEach(link=>{
  const key=link.dataset.filter.toLowerCase(),aliases=categories.find(c=>c[0].toLowerCase()===key)?.[1]||[key];
  const product=products.find(p=>aliases.includes(String(p.Category||"").toLowerCase())&&p.Image_Url);
  if(!product)return;
  link.classList.add("has-category-photo");
  const img=document.createElement("img");img.src=product.Image_Url;img.alt="";img.loading="lazy";img.className="category-photo";
  link.prepend(img);
 });
}
async function loadHomepageReviews(){
 const track=get("home-review-track");if(!track)return;
 try{
  const {data,error}=await getDb().from("product_reviews").select("id,product_id,reviewer_name,rating,review_text,created_at,is_verified_purchase").eq("is_approved",true).order("created_at",{ascending:false}).limit(8);
  if(error)throw error;
  const reviews=data||[];track.replaceChildren();
  if(!reviews.length){const empty=document.createElement("p");empty.className="review-loading";empty.textContent="Customer reviews will appear here as approved reviews come in.";track.append(empty);return}
  reviews.forEach(r=>{
   const card=document.createElement("article");card.className="home-review-card";
   const stars=document.createElement("div");stars.className="home-review-stars";stars.textContent="★".repeat(Math.max(0,Math.min(5,Number(r.rating))))+"☆".repeat(5-Math.max(0,Math.min(5,Number(r.rating))));
   const quote=document.createElement("p");quote.textContent="“"+r.review_text+"”";
   const name=document.createElement("strong");name.textContent=r.reviewer_name||"KENNIX customer";
   const verified=document.createElement("small");verified.textContent=r.is_verified_purchase?"✓ Verified purchase":"Customer review";
   card.append(stars,quote,name,verified);track.append(card);
  });
 }catch(err){console.warn("Homepage reviews unavailable",err);track.replaceChildren();const msg=document.createElement("p");msg.className="review-loading";msg.textContent="Customer reviews are temporarily unavailable.";track.append(msg)}
}
function setupJoggersCountdown(){
 const node=get("joggers-countdown");if(!node)return;
 const start=new Date("2026-11-30T00:00:00+01:00"),end=new Date("2026-12-14T00:00:00+01:00");
 const tick=()=>{const now=new Date();let target=now<start?start:end;let diff=Math.max(0,target-now);const days=Math.floor(diff/86400000),hours=Math.floor(diff%86400000/3600000),mins=Math.floor(diff%3600000/60000),secs=Math.floor(diff%60000/1000);
  node.innerHTML=now<start?"SALE STARTS IN <strong>"+days+"d "+hours+"h "+mins+"m "+secs+"s</strong>":now<end?"SALE ENDS IN <strong>"+days+"d "+hours+"h "+mins+"m "+secs+"s</strong>":"<strong>SALE ENDED</strong>";
 };tick();setInterval(tick,1000);
}
function setCategory(value,scroll=true){activeCategory=value||"All";document.querySelectorAll(".filter").forEach(b=>b.classList.toggle("active",categoryKey(b.dataset.filter)===categoryKey(activeCategory)));renderProducts();if(scroll)get("shop")?.scrollIntoView({behavior:"smooth"})}
function setupFilters(){document.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();setCategory(b.dataset.filter)}));document.querySelectorAll("[data-shortcut]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();sortMode="featured";if(get("sort"))get("sort").value="featured";setCategory("All",false);get("shop")?.scrollIntoView({behavior:"smooth"})}))}
function setupSearch(){get("product-search")?.addEventListener("input",e=>{searchText=e.target.value.trim().toLowerCase();renderProducts()});document.querySelector(".search-toggle")?.addEventListener("click",()=>{get("shop")?.scrollIntoView({behavior:"smooth"});get("product-search")?.focus()})}
function setupSorting(){get("sort")?.addEventListener("change",e=>{sortMode=e.target.value;renderProducts()})}
function toast(text){const t=get("toast");if(!t)return;t.textContent=text;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2200)}
function addToCart(id,variant=null,quantity=1){const p=products.find(x=>String(x.id)===String(id));if(!p)return;const available=variant?Number(variant.stock_quantity):Infinity;if(quantity<1||quantity>available){toast("That quantity is not available.");return}const key=variant?String(variant.id):"base";const old=cart.find(x=>String(x.id)===String(id)&&String(x.variantKey)===key);if(old){if(old.quantity+quantity>available){toast("You have reached the available stock.");return}old.quantity+=quantity}else cart.push({...p,variantKey:key,variantId:variant?.id||null,color:variant?.color||"",size:variant?.size||"",stock:available,Price:variant?.price??p.Price,quantity});renderCart();openCart();toast("Added to your bag.")}
function renderCart(){const count=cart.reduce((s,x)=>s+x.quantity,0),total=cart.reduce((s,x)=>s+Number(x.Price)*x.quantity,0);if(get("cart-count"))get("cart-count").textContent=count;if(get("drawer-count"))get("drawer-count").textContent=`(${count})`;if(get("subtotal"))get("subtotal").textContent=money(total);const box=get("cart-items");if(!box)return;box.replaceChildren();if(!cart.length){const p=document.createElement("p");p.textContent="Your bag is empty.";box.append(p);return}cart.forEach(item=>{const row=document.createElement("div");row.className="cart-row";const thumb=document.createElement("div");thumb.className="cart-thumb";if(item.Image_Url){const img=document.createElement("img");img.src=item.Image_Url;thumb.append(img)}else thumb.textContent="K";const d=document.createElement("div"),name=document.createElement("h4"),price=document.createElement("p"),qty=document.createElement("div");name.textContent=item.Name;price.textContent=money(item.Price)+(item.color?" · "+item.color:"")+(item.size?" · "+item.size:"");qty.className="qty";const minus=document.createElement("button");minus.textContent="−";minus.onclick=()=>{item.quantity--;if(item.quantity<1)cart=cart.filter(x=>x!==item);renderCart()};const amount=document.createElement("span");amount.textContent=item.quantity;const plus=document.createElement("button");plus.textContent="+";plus.disabled=item.variantId?item.quantity>=item.stock:false;plus.onclick=()=>{if(item.variantId&&item.quantity>=item.stock){toast("No more stock available.");return}item.quantity++;renderCart()};qty.append(minus,amount,plus);d.append(name,price,qty);const remove=document.createElement("button");remove.className="remove-btn";remove.textContent="REMOVE";remove.onclick=()=>{cart=cart.filter(x=>x!==item);renderCart()};row.append(thumb,d,remove);box.append(row)})}
function openCart(){get("overlay")?.classList.add("open");get("cart-drawer")?.classList.add("open");get("cart-drawer")?.setAttribute("aria-hidden","false")}
function closeCart(){get("cart-drawer")?.classList.remove("open");get("cart-drawer")?.setAttribute("aria-hidden","true");if(!get("product-modal")?.classList.contains("open"))get("overlay")?.classList.remove("open")}
async function openProduct(p){activeProduct=p;productVariants=[];selectedVariant=null;selectedQuantity=1;const box=get("modal-content");box.replaceChildren();const layout=document.createElement("div");layout.className="modal-layout";const imageBox=document.createElement("div");imageBox.className="modal-image";if(p.Image_Url){const img=document.createElement("img");img.src=p.Image_Url;img.alt=p.Name||"KENNIX product";imageBox.append(img)}else imageBox.textContent="KENNIX";const info=document.createElement("div");info.className="modal-info";const category=document.createElement("p");category.className="eyebrow";category.textContent=p.Category||"KENNIX";const title=document.createElement("h2");title.textContent=p.Name||"KENNIX product";const price=document.createElement("p");price.className="modal-price";price.innerHTML=p.compare_at_price?`<span class="old-price">${money(p.compare_at_price)}</span> <span class="sale-price">${money(p.Price)}</span> <small class="discount-pill">13% OFF</small>`:money(p.Price);const rawDescription=p.Description||"Selected from the KENNIX collection.";
const specsMarker="\\n\\n---KENNIX SPECS---\\n";
const specsIndex=rawDescription.indexOf(specsMarker);
const desc=document.createElement("p");desc.className="modal-description";desc.textContent=specsIndex>=0?rawDescription.slice(0,specsIndex):rawDescription;
const specsText=specsIndex>=0?rawDescription.slice(specsIndex+specsMarker.length).trim():"";
const specsBox=document.createElement("div");specsBox.className="product-specifications";
if(specsText){
 const specsTitle=document.createElement("h3");specsTitle.textContent="Product details";
 const specsList=document.createElement("ul");
 specsText.split(/\\r?\\n/).map(line=>line.trim()).filter(Boolean).forEach(line=>{const item=document.createElement("li");item.textContent=line;specsList.append(item)});
 specsBox.append(specsTitle,specsList);
}const options=document.createElement("div");options.className="variant-options";options.textContent="Loading available options...";const quantity=document.createElement("div");quantity.className="modal-quantity";const add=document.createElement("button");add.className="primary-btn modal-add";add.textContent="ADD TO BAG";add.disabled=true;add.onclick=()=>{if(productVariants.length&&!selectedVariant){toast("Choose a product option first.");return}addToCart(p.id,selectedVariant,selectedQuantity);closeProduct()};const note=document.createElement("p");note.className="modal-hint";note.textContent="Only one product photo is shown. Stock availability updates from the KENNIX inventory.";info.append(category,title,price,desc);if(specsText)info.append(specsBox);info.append(options,quantity,add,note);layout.append(imageBox,info);box.append(layout);loadProductReviews(p.id,box);get("product-modal").classList.add("open");get("product-modal").setAttribute("aria-hidden","false");get("overlay").classList.add("open");try{const {data,error}=await getDb().from("product_variants").select("id,product_id,color,size,stock_quantity,price,compare_at_price,sku,is_active").eq("product_id",p.id).eq("is_active",true).gt("stock_quantity",0).order("color").order("size");if(error)throw error;productVariants=data||[]}catch(e){console.warn("Could not load variants",e);productVariants=[]}options.replaceChildren();quantity.replaceChildren();if(productVariants.length){const colors=[...new Set(productVariants.map(v=>v.color))];const colorLabel=document.createElement("label");colorLabel.textContent="Option group";const colorSelect=document.createElement("select");colorSelect.id="variant-color";colors.forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;colorSelect.append(o)});const sizeLabel=document.createElement("label");sizeLabel.textContent="Choose "+(productVariants[0]?.color||"option");const sizeSelect=document.createElement("select");sizeSelect.id="variant-size";const stock=document.createElement("p");stock.className="stock-note";const sync=()=>{const matching=productVariants.filter(v=>v.color===colorSelect.value);const prior=sizeSelect.value;sizeSelect.replaceChildren();matching.forEach(v=>{const o=document.createElement("option");o.value=String(v.id);o.textContent=v.size;sizeSelect.append(o)});if(matching.some(v=>String(v.id)===prior))sizeSelect.value=prior;selectedVariant=matching.find(v=>String(v.id)===sizeSelect.value)||matching[0]||null;const unitPrice=selectedVariant?.price??p.Price;const original=selectedVariant?.compare_at_price??p.compare_at_price;price.innerHTML=original?`<span class="old-price">${money(original)}</span> <span class="sale-price">${money(unitPrice)}</span> <small class="discount-pill">13% OFF</small>`:money(unitPrice);stock.textContent=selectedVariant?(selectedVariant.stock_quantity<=3?"Only "+selectedVariant.stock_quantity+" left in this option":selectedVariant.stock_quantity+" available"):"This option is unavailable";add.disabled=!selectedVariant;add.textContent="ADD TO BAG";quantity.replaceChildren();const qLabel=document.createElement("label");qLabel.textContent="Quantity";const qInput=document.createElement("input");qInput.type="number";qInput.min="1";qInput.max=String(selectedVariant?.stock_quantity||1);qInput.value=String(Math.min(1,Number(qInput.max)));qInput.addEventListener("input",()=>{selectedQuantity=Math.max(1,Math.min(Number(qInput.max),Number(qInput.value)||1));qInput.value=String(selectedQuantity)});selectedQuantity=1;quantity.append(qLabel,qInput)};colorSelect.addEventListener("change",sync);sizeSelect.addEventListener("change",sync);options.append(colorLabel,colorSelect,sizeLabel,sizeSelect,stock);sync()}else{const stock=document.createElement("p");stock.className="stock-note";stock.textContent="Standard product option";options.append(stock);selectedVariant=null;const qLabel=document.createElement("label");qLabel.textContent="Quantity";const qInput=document.createElement("input");qInput.type="number";qInput.min="1";qInput.value="1";qInput.addEventListener("input",()=>selectedQuantity=Math.max(1,Number(qInput.value)||1));quantity.append(qLabel,qInput);add.disabled=false}}

async function loadProductReviews(productId,container){
 const section=document.createElement("section");section.className="product-reviews";
 const heading=document.createElement("h3");heading.textContent="Ratings & Reviews";
 const summary=document.createElement("p");summary.className="review-summary";summary.textContent="Loading customer reviews...";
 const list=document.createElement("div");list.className="review-list";
 const form=document.createElement("form");form.className="review-form";
 const formTitle=document.createElement("h4");formTitle.textContent="Share your experience";
 const name=document.createElement("input");name.type="text";name.maxLength=60;name.placeholder="Your name";name.required=true;
 const rating=document.createElement("select");rating.required=true;
 [["","Choose a rating"],["5","★★★★★ — Excellent"],["4","★★★★ — Very good"],["3","★★★ — Good"],["2","★★ — Fair"],["1","★ — Poor"]].forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;rating.append(o)});
 const body=document.createElement("textarea");body.maxLength=1000;body.rows=4;body.placeholder="Write your review...";body.required=true;
 const submit=document.createElement("button");submit.type="submit";submit.className="primary-btn";submit.textContent="SUBMIT REVIEW";
 const status=document.createElement("p");status.className="review-status";
 form.append(formTitle,name,rating,body,submit,status);section.append(heading,summary,list,form);container.append(section);
 const {data,error}=await getDb().from("product_reviews").select("id,reviewer_name,rating,review_text,created_at,admin_reply,admin_reply_at").eq("product_id",productId).eq("is_approved",true).order("created_at",{ascending:false});
 if(error){summary.textContent="Reviews are temporarily unavailable.";console.warn("Reviews could not load",error)}else{
  const reviews=data||[];
  if(!reviews.length)summary.textContent="No reviews yet. Be the first to share your experience.";
  else {const avg=reviews.reduce((s,r)=>s+Number(r.rating),0)/reviews.length;summary.textContent=avg.toFixed(1)+" / 5 · "+reviews.length+" customer review"+(reviews.length===1?"":"s");}
  reviews.forEach(r=>{const item=document.createElement("article");item.className="review-item";const top=document.createElement("div");top.className="review-item-top";const who=document.createElement("strong");who.textContent=r.reviewer_name;const stars=document.createElement("span");stars.textContent="★".repeat(Number(r.rating))+"☆".repeat(5-Number(r.rating));const date=document.createElement("small");date.textContent=new Date(r.created_at).toLocaleDateString("en-NG");const content=document.createElement("p");content.textContent=r.review_text;top.append(who,stars,date);item.append(top,content);if(r.admin_reply){const reply=document.createElement("div");reply.className="kennix-review-reply";const label=document.createElement("strong");label.textContent="KENNIX";const replyText=document.createElement("p");replyText.textContent=r.admin_reply;reply.append(label,replyText);if(r.admin_reply_at){const replyDate=document.createElement("small");replyDate.textContent=new Date(r.admin_reply_at).toLocaleDateString("en-NG");reply.append(replyDate)}item.append(reply)}list.append(item)});
 }
 form.addEventListener("submit",async e=>{e.preventDefault();submit.disabled=true;status.textContent="Submitting...";
  const {error:sendError}=await getDb().from("product_reviews").insert({product_id:productId,reviewer_name:name.value.trim(),rating:Number(rating.value),review_text:body.value.trim(),is_approved:false,is_verified_purchase:false});
  submit.disabled=false;
  if(sendError){status.textContent="Could not submit your review. Please try again.";console.warn(sendError);return}
  form.reset();status.textContent="Thank you. Your review has been submitted for approval and will appear once reviewed.";
 });
}
function closeProduct(){get("product-modal")?.classList.remove("open");get("product-modal")?.setAttribute("aria-hidden","true");if(!get("cart-drawer")?.classList.contains("open"))get("overlay")?.classList.remove("open")}
function setupCarousel(){const slides=[...document.querySelectorAll(".promo-slide")],dots=[...document.querySelectorAll("#promo-dots button")];if(!slides.length)return;const show=i=>{promoIndex=(i+slides.length)%slides.length;slides.forEach((s,n)=>s.classList.toggle("active",n===promoIndex));dots.forEach((d,n)=>d.classList.toggle("active",n===promoIndex))};const restart=()=>{clearInterval(promoTimer);promoTimer=setInterval(()=>show(promoIndex+1),3000)};get("promo-next").onclick=()=>{show(promoIndex+1);restart()};get("promo-prev").onclick=()=>{show(promoIndex-1);restart()};dots.forEach((d,i)=>d.onclick=()=>{show(i);restart()});let x=0;get("promo-slider").addEventListener("touchstart",e=>x=e.changedTouches[0].clientX,{passive:true});get("promo-slider").addEventListener("touchend",e=>{let dx=e.changedTouches[0].clientX-x;if(Math.abs(dx)>45){show(promoIndex+(dx<0?1:-1));restart()}},{passive:true});show(0);restart()}
function setupMenu(){const b=get("menu-toggle"),nav=get("main-nav");b?.addEventListener("click",()=>{nav.classList.toggle("open");b.setAttribute("aria-expanded",String(nav.classList.contains("open")))});nav?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>nav.classList.remove("open")))}
function setupNewsletter(){const form=get("newsletter-form");form?.addEventListener("submit",async e=>{e.preventDefault();const email=get("email").value.trim().toLowerCase(),button=form.querySelector("button");button.disabled=true;button.textContent="JOINING...";try{const {error}=await getDb().from("newsletter_subscribers").insert([{email}]);if(error){alert(error.code==="23505"?"This email has already joined the KENNIX list.":"Unable to join right now. Please try again.");return}alert("Welcome to the KENNIX list!");form.reset()}catch(err){console.error(err);alert("Something went wrong. Please try again.")}finally{button.disabled=false;button.textContent="JOIN THE LIST ↗"}})}

function openCheckoutForm(){
 const panel=get("checkout-panel"),checkoutButton=get("checkout-btn");
 if(!panel)return;
 panel.hidden=false;
 checkoutButton.hidden=true;
 panel.innerHTML=`<form id="kennix-checkout-form" class="checkout-form kennix-delivery-form">
 <div class="checkout-form-heading"><p class="eyebrow">KENNIX CHECKOUT</p><h3>Delivery information</h3><p>Enter your details so we can get your order to you.</p></div>
 <section class="checkout-field-group">
  <h4>Personal details</h4>
  <div class="checkout-field"><label for="checkout-name">Full name</label><input id="checkout-name" name="name" autocomplete="name" placeholder="Enter your full name" required maxlength="120></div>
  <div class="checkout-field"><label for="checkout-phone">Phone number</label><input id="checkout-phone" name="phone" type="tel" autocomplete="tel" placeholder="e.g. 08012345678" required></div>
 </section>
 <section class="checkout-field-group">
  <h4>Contact information</h4>
  <div class="checkout-field"><label for="checkout-email">Email address</label><input id="checkout-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
 </section>
 <section class="checkout-field-group">
  <h4>Delivery address</h4>
  <div class="checkout-field"><label for="checkout-address">Street address</label><textarea id="checkout-address" name="address" autocomplete="street-address" rows="2" placeholder="House number, street name" required></textarea></div>
  <div class="checkout-field-grid">
   <div class="checkout-field"><label for="checkout-city">City / town</label><input id="checkout-city" name="city" placeholder="Your city" required></div>
   <div class="checkout-field"><label for="checkout-state">State</label><input id="checkout-state" name="state" placeholder="Your state" required></div>
  </div>
  <div class="checkout-field"><label for="checkout-landmark">Landmark <span>(optional)</span></label><input id="checkout-landmark" name="landmark" placeholder="Nearby landmark"></div>
 </section>
 <button id="transfer-submit" class="primary-btn" type="submit">PLACE ORDER & GET TRANSFER DETAILS ↗</button>
 <button id="checkout-back" class="checkout-back" type="button">BACK TO BAG</button>
 <p class="checkout-error" id="checkout-error" role="alert"></p>
 </form>`;
 panel.querySelector("#checkout-back").addEventListener("click",()=>{panel.hidden=true;panel.replaceChildren();checkoutButton.hidden=false});
 panel.querySelector("#kennix-checkout-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const form=e.currentTarget,submit=panel.querySelector("#transfer-submit"),errorBox=panel.querySelector("#checkout-error");
  submit.disabled=true;submit.textContent="CREATING YOUR ORDER...";errorBox.textContent="";
  const customer={
   name:form.elements.name.value.trim(),
   phone:form.elements.phone.value.trim(),
   email:form.elements.email.value.trim(),
   address:form.elements.address.value.trim(),
   city:form.elements.city.value.trim(),
   state:form.elements.state.value.trim(),
   landmark:form.elements.landmark.value.trim()
  };
  const items=cart.map(item=>({product_id:item.id,variant_id:item.variantId,quantity:item.quantity}));
  try{
   const response=await fetch(`${SUPABASE_URL}/functions/v1/create-manual-transfer-order`,{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({customer,items})
   });
   let data;
   try{data=await response.json()}catch{throw new Error(`Checkout service returned an invalid response (${response.status}).`)}
   if(!response.ok)throw new Error(data?.error||`Checkout request failed (${response.status}).`);
   if(!data?.success||!data.order_reference||!data.payment)throw new Error(data?.error||"Your order could not be created. Please try again.");
   const amount=money(data.amount);
   const orderReference=String(data.order_reference);
   panel.innerHTML=`<section class="checkout-form transfer-instructions">
    <h3>Order created</h3>
    <p>Your order reference:</p><div class="order-reference-row"><h2 id="created-order-reference">${orderReference}</h2><button type="button" id="copy-order-reference">COPY KNX CODE</button></div>
    <p class="order-reference-notice"><strong>Important:</strong> Copy your KNX order code and keep it somewhere safe. You will need this code to track your order and when contacting KENNIX about your purchase.</p>
    <p>Subtotal: <strong>${money(data.subtotal)}</strong></p>
    <p>First-purchase discount: <strong>−${money(data.discount_amount)}</strong></p>
    <p>Delivery: <strong>FREE</strong></p>
    <p><strong>Estimated arrival:</strong> Your order should arrive within <strong>7 to 18 days</strong> after your payment is confirmed.</p>
    <h3>Transfer ${amount} to:</h3>
    <p>Bank: <strong>${data.payment.bank}</strong></p>
    <p>Account name: <strong>${data.payment.account_name}</strong></p>
    <p>Account number: <strong id="kennix-account-number">${data.payment.account_number}</strong>
    <button type="button" id="copy-account-number">COPY ACCOUNT NUMBER</button></p>
    <p>${data.payment.instructions}</p>
    <p><strong>Important:</strong> Use the exact amount and keep your transfer receipt. Payment is not confirmed until KENNIX verifies it.</p>
    <hr>
    <h3>Upload your transfer receipt</h3>
    <p>After making your transfer, upload a clear receipt (JPG, PNG, WEBP or PDF; maximum 5MB).</p>
    <form id="kennix-receipt-form">
      <input id="kennix-receipt-file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" required>
      <button class="primary-btn" id="kennix-upload-receipt" type="submit">UPLOAD RECEIPT</button>
      <p id="kennix-upload-message" role="status"></p>
    </form>
    <div class="checkout-track-callout"><p>Want to check your order progress?</p><a class="primary-btn checkout-track-button" href="track-order.html?reference=${encodeURIComponent(orderReference)}">TRACK MY ORDER ↗</a></div>
    <p>Need help? WhatsApp: <a href="https://wa.me/2349135102119" target="_blank" rel="noopener">Contact KENNIX</a></p>
    <button class="primary-btn" type="button" id="transfer-done">DONE</button>
   </section>`;

   panel.querySelector("#copy-order-reference").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(orderReference);toast("KNX code copied.");}
    catch{toast("Please copy the KNX code manually.");}
   });
   panel.querySelector("#copy-account-number").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(String(data.payment.account_number));toast("Account number copied.");}
    catch{toast("Please copy the account number manually.");}
   });
   panel.querySelector("#kennix-receipt-form").addEventListener("submit",async uploadEvent=>{
    uploadEvent.preventDefault();
    const file=panel.querySelector("#kennix-receipt-file").files[0];
    const uploadButton=panel.querySelector("#kennix-upload-receipt");
    const uploadMessage=panel.querySelector("#kennix-upload-message");
    if(!file)return;
    if(file.size>5*1024*1024){uploadMessage.textContent="File is larger than 5MB. Choose a smaller file.";return;}
    const allowed=["image/jpeg","image/png","image/webp","application/pdf"];
    if(!allowed.includes(file.type)){uploadMessage.textContent="Choose a JPG, PNG, WEBP or PDF file.";return;}
    uploadButton.disabled=true;uploadButton.textContent="UPLOADING...";
    uploadMessage.textContent="Please wait...";
    try{
     const base64=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result).split(",")[1]);
      reader.onerror=()=>reject(new Error("Could not read the selected file."));
      reader.readAsDataURL(file);
     });
     const uploadResponse=await fetch(`${SUPABASE_URL}/functions/v1/upload-payment-proof`,{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY},
      body:JSON.stringify({order_reference:orderReference,phone:customer.phone,mime_type:file.type,file_base64:base64})
     });
     const uploadData=await uploadResponse.json();
     if(!uploadResponse.ok||!uploadData?.success)throw new Error(uploadData?.error||"Receipt upload failed.");
     uploadMessage.textContent="Receipt submitted. KENNIX will review your payment.";
     panel.querySelector("#kennix-receipt-file").disabled=true;
     uploadButton.hidden=true;
    }catch(uploadError){
     uploadMessage.textContent=uploadError.message||"Receipt upload failed. Please try again.";
     uploadButton.disabled=false;uploadButton.textContent="UPLOAD RECEIPT";
    }
   });
   panel.querySelector("#transfer-done").addEventListener("click",()=>{
    cart=[];renderCart();panel.hidden=true;panel.replaceChildren();checkoutButton.hidden=false;closeCart();
    toast("Order created. You can track it using your order reference.");
   });
  }catch(err){
   console.error("KENNIX manual checkout failed:",err);
   errorBox.textContent=err?.context?.error||err?.message||"Unable to create your order. Please try again.";
   submit.disabled=false;submit.textContent="PLACE ORDER & GET TRANSFER DETAILS ↗";
  }
 });
}
function setupTerms(){
 const gate=get("terms-gate");
 if(!gate)return;
 const storageKey="kennix_terms_accepted_2026_11_03";
 const show=()=>{gate.hidden=false;document.body.style.overflow="hidden";};
 const hide=()=>{gate.hidden=true;document.body.style.overflow="";};
 if(localStorage.getItem(storageKey)!=="yes")show();
 get("terms-accept")?.addEventListener("click",()=>{localStorage.setItem(storageKey,"yes");hide();});
 get("terms-decline")?.addEventListener("click",()=>{get("terms-decline-note").hidden=false;});
 get("open-terms")?.addEventListener("click",e=>{e.preventDefault();get("terms-decline-note").hidden=true;show();});
}
function startKennixLoader(onComplete){const root=get("kennix-page-loader");if(!root){onComplete?.();return}const fill=get("kennix-progress-fill"),number=get("kennix-progress-number");let value=0;const started=Date.now();const tick=setInterval(()=>{const elapsed=Date.now()-started;value=elapsed<2600?Math.min(99,Math.round(elapsed/2600*99)):elapsed<3050?99:100;if(fill)fill.style.width=value+"%";if(number)number.textContent=value+"%";if(value===100){clearInterval(tick);setTimeout(()=>{root.classList.add("is-hidden");setTimeout(()=>{root.remove();onComplete?.()},450)},180)}},45)}
function init(){startKennixLoader(setupTerms);setupMenu();get("open-cart").onclick=openCart;get("close-cart").onclick=closeCart;get("overlay").onclick=()=>{closeCart();closeProduct()};get("modal-close").onclick=closeProduct;document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeCart();closeProduct()}});get("checkout-btn").onclick=()=>{if(!cart.length){toast("Your bag is empty.");return}openCheckoutForm()};setupSearch();setupFilters();setupSorting();setupCarousel();setupJoggersCountdown();setupNewsletter();renderCart();loadProducts()}init();