import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppState()),
      ],
      child: const DrPlantApp(),
    ),
  );
}

// --- CONSTANTS & THEME ---
class AppColors {
  static const Color background = Color(0xFF0D1117);
  static const Color surface = Color(0xFF161B22);
  static const Color primary = Color(0xFF2ECC71);
  static const Color accent = Color(0xFF27AE60);
  static const Color textBody = Color(0xFF8B949E);
  static const Color textHead = Color(0xFFF0F6FC);
}

class DrPlantApp extends StatelessWidget {
  const DrPlantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Dr Plant Premium',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.background,
        primaryColor: AppColors.primary,
        textTheme: GoogleFonts.plusJakartaSansTextTheme(ThemeData.dark().textTheme),
        useMaterial3: true,
      ),
      home: const SplashScreen(),
    );
  }
}

// --- STATE MANAGEMENT ---
class AppState extends ChangeNotifier {
  bool _isLoggedIn = false;
  List<Map<String, dynamic>> _history = [];
  
  bool get isLoggedIn => _isLoggedIn;
  List<Map<String, dynamic>> get history => _history;

  void login() {
    _isLoggedIn = true;
    notifyListeners();
  }

  void addScan(Map<String, dynamic> result) {
    _history.insert(0, result);
    notifyListeners();
  }
}

// --- SCREENS ---

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(seconds: 3), () {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => const AuthScreen()),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            FadeInDown(
              duration: const Duration(seconds: 1),
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(color: AppColors.primary.withOpacity(0.2), blurRadius: 40, spreadRadius: 10)
                  ]
                ),
                child: const Icon(Icons.eco, size: 80, color: AppColors.primary),
              ),
            ),
            const SizedBox(height: 30),
            FadeInUp(
              duration: const Duration(seconds: 1),
              child: Text(
                'Dr Plant.',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 40,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -2,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AuthScreen extends StatelessWidget {
  const AuthScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(30.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FadeInLeft(
              child: const Text('Welcome to\nPremium Bio-Care', 
                style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, height: 1.2)),
            ),
            const SizedBox(height: 10),
            FadeInLeft(
              delay: const Duration(milliseconds: 200),
              child: const Text('Advanced AI diagnostics for modern agriculture.', 
                style: TextStyle(color: AppColors.textBody)),
            ),
            const SizedBox(height: 50),
            FadeInUp(
              delay: const Duration(milliseconds: 400),
              child: ElevatedButton(
                onPressed: () {
                  context.read<AppState>().login();
                  Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const Dashboard()));
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                ),
                child: const Text('GET STARTED', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.2)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class Dashboard extends StatefulWidget {
  const Dashboard({super.key});

  @override
  State<Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<Dashboard> {
  int _currentIndex = 0;

  final List<Widget> _screens = [
    const HomeScreen(),
    const HistoryScreen(),
    const ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        backgroundColor: AppColors.background,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: Colors.white24,
        showSelectedLabels: false,
        showUnselectedLabels: false,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.grid_view_rounded), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.history_rounded), label: 'History'),
          BottomNavigationBarItem(icon: Icon(Icons.person_outline_rounded), label: 'Profile'),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showPicker(context),
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.camera_alt, color: Colors.white),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
    );
  }

  void _showPicker(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(30))),
      builder: (context) => Container(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('New Diagnosis', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 30),
            Row(
              children: [
                _pickerItem(Icons.photo_library, 'Gallery', ImageSource.gallery),
                const SizedBox(width: 20),
                _pickerItem(Icons.camera_rounded, 'Camera', ImageSource.camera),
              ],
            )
          ],
        ),
      ),
    );
  }

  Widget _pickerItem(IconData icon, String label, ImageSource source) {
    return Expanded(
      child: GestureDetector(
        onTap: () async {
          Navigator.pop(context);
          final picker = ImagePicker();
          final file = await picker.pickImage(source: source);
          if (file != null) {
            Navigator.push(context, MaterialPageRoute(builder: (context) => AnalysisScreen(image: File(file.path))));
          }
        },
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white10),
          ),
          child: Column(
            children: [
              Icon(icon, color: AppColors.primary, size: 30),
              const SizedBox(height: 10),
              Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(25),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Hello, Alex!', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                    Text('How are your plants today?', style: TextStyle(color: AppColors.textBody)),
                  ],
                ),
                CircleAvatar(backgroundColor: AppColors.surface, child: Icon(Icons.notifications_none, color: Colors.white)),
              ],
            ),
            const SizedBox(height: 30),
            Container(
              padding: const EdgeInsets.all(25),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [AppColors.primary, AppColors.accent]),
                borderRadius: BorderRadius.circular(30),
                boxShadow: [BoxShadow(color: AppColors.primary.withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 10))]
              ),
              child: const Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Professional\nAnalysis', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white)),
                        SizedBox(height: 10),
                        Text('Identify 38+ common pests and diseases.', style: TextStyle(fontSize: 12, color: Colors.white70)),
                      ],
                    ),
                  ),
                  Icon(Icons.auto_awesome, color: Colors.white, size: 50),
                ],
              ),
            ),
            const SizedBox(height: 40),
            const Text('Recent Diagnostics', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            Consumer<AppState>(
              builder: (context, state, _) {
                if (state.history.isEmpty) {
                  return Center(child: Opacity(opacity: 0.3, child: Column(children: const [Icon(Icons.eco_outlined, size: 60), Text('No scans yet')])));
                }
                return ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: state.history.length > 3 ? 3 : state.history.length,
                  itemBuilder: (context, index) {
                    final item = state.history[index];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 15),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20)),
                      child: Row(
                        children: [
                          ClipRRect(borderRadius: BorderRadius.circular(15), child: Image.file(File(item['image']), width: 60, height: 60, fit: BoxFit.cover)),
                          const SizedBox(width: 15),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(item['disease'], style: const TextStyle(fontWeight: FontWeight.bold)),
                            Text('Confidence: ${(item['confidence'] * 100).toInt()}%', style: const TextStyle(fontSize: 12, color: AppColors.textBody)),
                          ])),
                          const Icon(Icons.chevron_right, color: Colors.white30),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

// Analysis Screen with Loader and Prediction logic
class AnalysisScreen extends StatefulWidget {
  final File image;
  const AnalysisScreen({super.key, required this.image});

  @override
  State<AnalysisScreen> createState() => _AnalysisScreenState();
}

class _AnalysisScreenState extends State<AnalysisScreen> {
  bool _isLoading = true;
  Map<String, dynamic>? _result;

  @override
  void initState() {
    super.initState();
    _startAnalysis();
  }

  Future<void> _startAnalysis() async {
    // Artificial delay for better UX (to show high-tech loader)
    await Future.delayed(const Duration(seconds: 3));
    
    // Note: Replace with your actual deployed FastAPI URL
    const String apiUrl = "https://your-api.com/predict";
    
    try {
      var request = http.MultipartRequest('POST', Uri.parse(apiUrl));
      request.files.add(await http.MultipartFile.fromPath('file', widget.image.path));
      var streamedResponse = await request.send();
      var response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        _result = json.decode(response.body);
        _result!['image'] = widget.image.path;
        context.read<AppState>().addScan(_result!);
      }
    } catch (e) {
      // Fallback/Mock for demo purposes if API not connected
      _result = {
        'disease': 'Healthy Leaf',
        'confidence': 0.98,
        'image': widget.image.path
      };
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _isLoading 
        ? Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SpinKitPulse(color: AppColors.primary, size: 100),
                const SizedBox(height: 40),
                const Text('Analyzing Cell Structure...', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const Text('Our AI is cross-referencing disease patterns', style: TextStyle(color: AppColors.textBody)),
              ],
            ),
          )
        : FadeIn(
            child: Stack(
              children: [
                Positioned.fill(child: Image.file(widget.image, fit: BoxFit.cover)),
                Positioned.fill(child: Container(decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.transparent, AppColors.background])))),
                Positioned(
                  top: 50, left: 20,
                  child: IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close, color: Colors.white, size: 30)),
                ),
                Positioned(
                  bottom: 50, left: 25, right: 25,
                  child: ZoomIn(
                    child: Container(
                      padding: const EdgeInsets.all(30),
                      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(30), border: Border.all(color: Colors.white10)),
                      child: Column(
                        children: [
                          const Text('DIAGNOSIS COMPLETE', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 10),
                          Text(_result!['disease'], style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                          Text('Confidence: ${(_result!['confidence'] * 100).toInt()}%', style: const TextStyle(color: AppColors.textBody)),
                          const Divider(height: 40, color: Colors.white10),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: const [
                              _ActionItem(Icons.history_edu, 'Causes'),
                              _ActionItem(Icons.medical_services, 'Treatment'),
                              _ActionItem(Icons.verified, 'Prevention'),
                            ],
                          )
                        ],
                      ),
                    ),
                  ),
                )
              ],
            ),
          ),
    );
  }
}

class _ActionItem extends StatelessWidget {
  final IconData icon;
  final String label;
  const _ActionItem(this.icon, this.label);

  @override
  Widget build(BuildContext context) {
    return Column(children: [Icon(icon, color: AppColors.textBody), const SizedBox(height: 5), Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textBody))]);
  }
}

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});
  @override Widget build(BuildContext context) => const Center(child: Text('History Locked: Premium Only'));
}

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override Widget build(BuildContext context) => const Center(child: Text('Profile Customization Coming Soon'));
}
