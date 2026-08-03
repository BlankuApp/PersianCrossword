package com.persiancrossword.app;

import android.graphics.Rect;
import android.os.Build;
import android.view.View;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

/** Keeps the system Back gesture from stealing edge swipes over draggable UI (Android 10+). */
@CapacitorPlugin(name = "GestureExclusion")
public class GestureExclusionPlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) throws JSONException {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.resolve();
            return;
        }

        JSArray input = call.getArray("rects", new JSArray());
        List<Rect> rects = new ArrayList<>();
        for (int i = 0; i < input.length(); i++) {
            // each entry: [left, top, right, bottom] in device pixels
            JSONArray r = input.getJSONArray(i);
            rects.add(new Rect(r.getInt(0), r.getInt(1), r.getInt(2), r.getInt(3)));
        }

        View view = bridge.getWebView();
        view.post(() -> view.setSystemGestureExclusionRects(rects));
        call.resolve();
    }
}
