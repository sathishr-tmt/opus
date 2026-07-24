// Extracted from the original frontend/src/App.jsx during the Step 4 modular split.
// Code is moved unchanged; only imports/exports were added.

import { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api.js';
import { PageHeader, EmptyState, FilterInput } from '../../components/ui.jsx';

function CalendarPage({ onDashboardChange, showToast }) {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({
    title: '',
    date: '',
    time: '',
    notes: ''
  });

  async function loadEvents() {
    try {
      const data = await apiRequest('/api/calendar');
      setEvents(data.events || []);
    } catch {
      showToast('Failed to load calendar events.');
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  function updateForm(name, value) {
    setForm((previous) => ({
      ...previous,
      [name]: value
    }));
  }

  async function addEvent() {
    if (!form.title || !form.date) {
      showToast('Please enter event title and date.');
      return;
    }

    try {
      const data = await apiRequest('/api/calendar', {
        method: 'POST',
        body: JSON.stringify(form)
      });

      setEvents(data.events || []);
      setForm({ title: '', date: '', time: '', notes: '' });

      await onDashboardChange();
      showToast('Calendar event added.');
    } catch {
      showToast('Failed to add event.');
    }
  }

  async function deleteEvent(eventId) {
    try {
      const data = await apiRequest(`/api/calendar/${eventId}`, {
        method: 'DELETE'
      });

      setEvents(data.events || []);
      await onDashboardChange();
      showToast('Calendar event deleted.');
    } catch {
      showToast('Failed to delete event.');
    }
  }

  return (
    <section>
      <PageHeader
        title="Calendar"
        subtitle="Manage interviews, reminders, and job search events."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Add Event</h2>

          <div className="mt-4 grid gap-4">
            <FilterInput
              label="Event Title"
              value={form.title}
              onChange={(value) => updateForm('title', value)}
              placeholder="Interview with company"
            />

            <FilterInput
              label="Date"
              type="date"
              value={form.date}
              onChange={(value) => updateForm('date', value)}
            />

            <FilterInput
              label="Time"
              type="time"
              value={form.time}
              onChange={(value) => updateForm('time', value)}
            />

            <FilterInput
              label="Notes"
              value={form.notes}
              onChange={(value) => updateForm('notes', value)}
              placeholder="Meeting notes"
            />

            <button
              onClick={addEvent}
              className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white"
            >
              Add Event
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Upcoming Events</h2>

          <div className="mt-4 grid gap-3">
            {events.length ? (
              events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 p-4"
                >
                  <div>
                    <h3 className="font-black text-slate-900">
                      {event.title}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {event.date} {event.time ? `· ${event.time}` : ''}
                    </p>
                    {event.notes && (
                      <p className="mt-1 text-sm text-slate-400">
                        {event.notes}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => deleteEvent(event.id)}
                    className="rounded-xl bg-red-50 px-4 py-2 text-sm font-black text-red-600"
                  >
                    Delete
                  </button>
                </div>
              ))
            ) : (
              <EmptyState text="No calendar events yet." />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export {
  CalendarPage
};
