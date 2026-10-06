// =====================================================================
// Report : new issue form
//  - pick a location (tap the map, drag the pin, or GPS)
//  - preview the photo before upload
//  - check for similar open issues nearby and offer "Me too" instead
//  - submit as FormData so the photo is uploaded with the text
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Marker } from 'react-leaflet';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BaseMap, ClickToPick, FlyTo, dropPinIcon } from '../components/MapParts';
import { useCategories } from '../hooks';
import { STATUS_LABELS } from '../utils';

const MAX_PHOTO = 5 * 1024 * 1024;

export default function Report() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const categories = useCategories();

  const [form, setForm] = useState({ category: '', title: '', description: '', landmark: '' });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [photoNote, setPhotoNote] = useState('JPG, PNG or WebP, up to 5 MB.');
  const [pinned, setPinned] = useState(null); // { lat, lng }
  const [flyTarget, setFlyTarget] = useState(null);
  const [locating, setLocating] = useState(false);
  const [nearby, setNearby] = useState({ issues: [], radius: 150 });
  const [errors, setErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef(null);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function pick(lat, lng) {
    setPinned({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
  }

  function useMyLocation() {
    if (!navigator.geolocation) return toast('Your browser can\'t share location. Tap the map instead.', 'error');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        pick(pos.coords.latitude, pos.coords.longitude);
        setFlyTarget([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {
        setLocating(false);
        toast('Location is blocked. Tap the map instead.', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Duplicate check: runs whenever the pin or category changes
  useEffect(() => {
    if (!pinned || !form.category) {
      setNearby({ issues: [], radius: 150 });
      return;
    }
    let cancelled = false;
    api(`/api/issues/nearby?lat=${pinned.lat}&lng=${pinned.lng}&category=${form.category}`)
      .then((d) => !cancelled && setNearby({ issues: d.issues, radius: d.radius_m }))
      .catch(() => {}); // a helper only; never block reporting
    return () => { cancelled = true; };
  }, [pinned, form.category]);

  // Free the preview image memory when it changes or the page closes
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  function choosePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_PHOTO) {
      e.target.value = '';
      setPhoto(null);
      setPreview('');
      setPhotoNote('That photo is over 5 MB. Choose a smaller one.');
      return;
    }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setPhotoNote(file.name);
  }

  async function backExisting(id) {
    try {
      await api(`/api/issues/${id}/support`, { method: 'POST' });
      navigate(`/issues/${id}?backed=1`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function submit(e) {
    e.preventDefault();
    const problems = [];
    if (!form.category) problems.push('Choose a category.');
    if (form.title.trim().length < 5) problems.push('Give the issue a short title (at least 5 characters).');
    if (form.description.trim().length < 10) problems.push('Describe the issue in at least 10 characters.');
    if (!pinned) problems.push('Pin the location on the map.');
    setErrors(problems);
    if (problems.length) {
      setTimeout(() => errorRef.current?.scrollIntoView({ block: 'center' }), 0);
      return;
    }

    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => data.append(k, v.trim()));
    data.append('latitude', pinned.lat);
    data.append('longitude', pinned.lng);
    if (photo) data.append('photo', photo);

    setSubmitting(true);
    try {
      const { id } = await api('/api/issues', { method: 'POST', form: data });
      navigate(`/issues/${id}?new=1`);
    } catch (err) {
      setErrors([err.message]);
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Report an issue</h1>
        <p>
          Tell the ward what's wrong and where. If a neighbour already reported the same thing nearby, you can
          back their report instead, so the officer sees how many people it affects.
        </p>
      </div>

      <form className="split" onSubmit={submit} noValidate>
        <div className="panel">
          <div className="form-error" id="form-error" role="alert" ref={errorRef}>
            {errors.map((p) => <div key={p}>{p}</div>)}
          </div>

          <div className="field">
            <label htmlFor="category">What kind of problem is it?</label>
            <select id="category" value={form.category} onChange={update('category')} required>
              <option value="">Choose a category</option>
              {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="title">Short title</label>
            <input type="text" id="title" maxLength={150} value={form.title} onChange={update('title')}
              placeholder="e.g. Deep pothole at the bus stop" required />
          </div>

          <div className="field">
            <label htmlFor="description">What's happening?</label>
            <textarea id="description" value={form.description} onChange={update('description')}
              placeholder="How bad is it, since when, and who is affected?" required />
            <span className="hint">
              Mention anything dangerous, such as children, accidents, live wires or sewage. It helps the officer prioritise.
            </span>
          </div>

          <div className="field">
            <label htmlFor="landmark">Nearest landmark (optional)</label>
            <input type="text" id="landmark" maxLength={200} value={form.landmark} onChange={update('landmark')}
              placeholder="e.g. Opposite the post office" />
          </div>

          <div className="field">
            <span className="label">Photo (optional, recommended)</span>
            <div className="photo-drop">
              {preview && <img src={preview} alt="Preview of the photo you chose" />}
              <label className="btn btn-secondary btn-small" htmlFor="photo">
                {photo ? 'Choose a different photo' : 'Choose a photo'}
              </label>
              <input type="file" id="photo" accept="image/jpeg,image/png,image/webp"
                className="visually-hidden" onChange={choosePhoto} />
              <span className="hint">{photoNote}</span>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" id="submit-btn" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </div>

        <div>
          <div className="panel">
            <span className="label"><strong>Where is it?</strong></span>
            <p className="hint">Tap the map to drop a pin, or use your current location. Drag the pin to adjust.</p>
            <div id="picker">
              <BaseMap zoom={13} className="map-picker">
                <ClickToPick onPick={(ll) => pick(ll.lat, ll.lng)} />
                <FlyTo target={flyTarget} zoom={17} />
                {pinned && (
                  <Marker
                    position={[pinned.lat, pinned.lng]}
                    icon={dropPinIcon}
                    draggable
                    eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); pick(p.lat, p.lng); } }}
                  />
                )}
              </BaseMap>
            </div>
            <div className="map-tools">
              <button type="button" className="btn btn-secondary btn-small" id="locate-btn" onClick={useMyLocation}>
                Use my location
              </button>
              <span className="coords" id="coords">
                {locating ? 'Finding you…' : pinned ? `Pinned at ${pinned.lat}, ${pinned.lng}` : 'No location chosen yet'}
              </span>
            </div>
          </div>

          {nearby.issues.length > 0 && (
            <section className="nearby" id="nearby" aria-live="polite">
              <h3>This may already be reported</h3>
              <p>
                {nearby.issues.length === 1 ? 'An open report' : `${nearby.issues.length} open reports`} of the same kind{' '}
                {nearby.issues.length === 1 ? 'is' : 'are'} within {nearby.radius} m of your pin. If it's the same
                problem, back it instead of filing a new one. It raises the priority.
              </p>
              <ul>
                {nearby.issues.map((i) => (
                  <li key={i.id}>
                    <div>
                      <Link to={`/issues/${i.id}`} target="_blank" rel="noopener">{i.title}</Link>
                      <small>{i.distance_m} m away, {STATUS_LABELS[i.status].toLowerCase()}, {i.supporters} backing</small>
                    </div>
                    {i.reporter_id === user.id ? (
                      <small>Your report</small>
                    ) : (
                      <button type="button" className="btn btn-marking btn-small" onClick={() => backExisting(i.id)}>
                        Me too
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="hint">Different problem? Carry on with the form.</p>
            </section>
          )}
        </div>
      </form>
    </main>
  );
}
