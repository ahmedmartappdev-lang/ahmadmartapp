package in.ahmadmart.app;

import android.graphics.Color;
import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Capacitor's SystemBars plugin pads the WebView below the system
        // bars on Android 15+ (as long as the page does NOT declare
        // viewport-fit=cover — see index.html). Here we only style the strip
        // behind the bars: white backdrop matching the site's header/nav,
        // with dark icons so the clock stays legible.
        getWindow().getDecorView().setBackgroundColor(Color.WHITE);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                .setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                .setAppearanceLightNavigationBars(true);
    }
}
