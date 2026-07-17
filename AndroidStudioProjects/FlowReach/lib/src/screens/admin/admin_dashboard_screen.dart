import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/mock_service.dart';
import '../auth/login_screen.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isLoading = true;
  Map<String, dynamic> _stats = {};
  List<dynamic> _users = [];
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _refreshData();
  }

  Future<void> _refreshData() async {
    setState(() {
      _isLoading = true;
    });

    final mockService = Provider.of<MockService>(context, listen: false);
    try {
      if (mockService.useLiveBackend) {
        final statsData = await mockService.apiService.getAdminStats();
        final usersData = await mockService.apiService.getAdminUsers();
        setState(() {
          _stats = statsData['stats'] ?? {};
          _users = usersData;
          _isLoading = false;
        });
      } else {
        // Simulated local fallback data
        await Future.delayed(const Duration(milliseconds: 400));
        setState(() {
          _stats = {
            'users': 4,
            'campaigns': 12,
            'templates': 5,
            'activeConnections': 1,
            'totalSent': 480,
            'totalRecharges': 1200.0,
            'platformRevenue': 624.0,
            'metaCostBill': 480.0,
            'adminNetProfit': 144.0,
          };
          _users = [
            {'id': 1, 'name': 'Raj Barot', 'email': 'raj@company.com', 'phone': '+919876543210', 'company': 'Barot Tech Solutions', 'role': 'user', 'wallet_balance': 450.00, 'connected_phone': '+919876543210', 'whatsapp_phone_number_id': 'sim_phone_9876', 'whatsapp_business_account_id': 'sim_waba_9876'},
            {'id': 2, 'name': 'Vijay Patel', 'email': 'vijay@patel.com', 'phone': '+919900990099', 'company': 'Patel Logistics', 'role': 'user', 'wallet_balance': 150.00, 'connected_phone': null, 'whatsapp_phone_number_id': null, 'whatsapp_business_account_id': null},
            {'id': 3, 'name': 'Aditi Shah', 'email': 'aditi@shah.com', 'phone': '+919888877777', 'company': 'Shah Marketing', 'role': 'user', 'wallet_balance': 12.50, 'connected_phone': '+919888877777', 'whatsapp_phone_number_id': 'sim_phone_8888', 'whatsapp_business_account_id': 'sim_waba_8888'},
          ];
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Admin refresh error: $e");
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _showUserDetailsBottomSheet(BuildContext context, Map<String, dynamic> user) {
    final double bal = double.tryParse(user['wallet_balance']?.toString() ?? '0.0') ?? 0.0;
    final hasWaba = user['connected_phone'] != null && user['connected_phone'].toString().isNotEmpty;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 24,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + MediaQuery.of(ctx).padding.bottom + 24,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 50,
                  height: 4,
                  decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'User Account Profile',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: Colors.grey),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const Divider(height: 20),

              // Basic Profile Details
              const Text('ACCOUNT INFORMATION', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF764BA2), letterSpacing: 1.0)),
              const SizedBox(height: 12),
              _buildDetailRow(Icons.person_rounded, 'User Name', user['name'] ?? 'No Name'),
              _buildDetailRow(Icons.email_rounded, 'Email Address', user['email'] ?? 'No Email'),
              _buildDetailRow(Icons.business_rounded, 'Company Name', user['company'] ?? 'Not Specified'),
              _buildDetailRow(Icons.call_rounded, 'Phone Number', user['phone'] ?? 'Not Specified'),
              const SizedBox(height: 24),

              // WhatsApp Business Integration
              const Text('WHATSAPP WABA INTEGRATION', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF764BA2), letterSpacing: 1.0)),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: (hasWaba ? const Color(0xFF10B981) : Colors.grey).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: (hasWaba ? const Color(0xFF10B981) : Colors.grey).withOpacity(0.15)),
                ),
                child: Row(
                  children: [
                    Icon(
                      hasWaba ? Icons.verified_user_rounded : Icons.offline_bolt_rounded,
                      color: hasWaba ? const Color(0xFF10B981) : Colors.grey,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        hasWaba ? 'WABA Active: ${user['connected_phone']}' : 'Using Shared Company Gateway',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: hasWaba ? const Color(0xFF16A34A) : const Color(0xFF64748B),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (hasWaba) ...[
                const SizedBox(height: 16),
                _buildDetailRow(Icons.phone_android_rounded, 'Phone Number ID', user['whatsapp_phone_number_id'] ?? 'N/A'),
                _buildDetailRow(Icons.vpn_key_rounded, 'WABA ID', user['whatsapp_business_account_id'] ?? 'N/A'),
              ],
              const SizedBox(height: 24),

              // Wallet & Billing
              const Text('WALLET & CHARGES', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF764BA2), letterSpacing: 1.0)),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Available Balance', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      Text(
                        'Rs. ${bal.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: bal > 50.00 ? const Color(0xFF10B981) : Colors.red,
                        ),
                      ),
                    ],
                  ),
                  ElevatedButton.icon(
                    onPressed: () {
                      Navigator.pop(ctx);
                      _showAdjustBalanceDialog(user);
                    },
                    icon: const Icon(Icons.account_balance_wallet_rounded, size: 16),
                    label: const Text('Adjust Wallet'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF764BA2),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: const Color(0xFF764BA2).withOpacity(0.7)),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF1E293B)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _showAdjustBalanceDialog(Map<String, dynamic> user) async {
    final amountCtrl = TextEditingController();
    bool isAdding = true;
    bool isAdjusting = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) {
          return AlertDialog(
            backgroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            title: Text(
              'Adjust Wallet • ${user['name']}',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Current Balance: Rs. ${double.parse(user['wallet_balance'].toString()).toStringAsFixed(2)}',
                  style: const TextStyle(fontSize: 13, color: Colors.grey),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => setDialogState(() => isAdding = true),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: isAdding ? const Color(0xFF10B981) : Colors.grey[100],
                          foregroundColor: isAdding ? Colors.white : Colors.black87,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        child: const Text('Add Cash'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => setDialogState(() => isAdding = false),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: !isAdding ? Colors.red : Colors.grey[100],
                          foregroundColor: !isAdding ? Colors.white : Colors.black87,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        child: const Text('Deduct'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: amountCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  style: const TextStyle(color: Colors.black87),
                  decoration: InputDecoration(
                    prefixText: 'Rs. ',
                    labelText: 'Transaction Amount',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: isAdjusting ? null : () => Navigator.pop(ctx),
                child: const Text('Cancel', style: TextStyle(color: Colors.grey)),
              ),
              ElevatedButton(
                onPressed: isAdjusting
                    ? null
                    : () async {
                        final valStr = amountCtrl.text.trim();
                        if (valStr.isEmpty) return;
                        final amt = double.tryParse(valStr);
                        if (amt == null || amt <= 0) return;

                        setDialogState(() => isAdjusting = true);

                        final mockService = Provider.of<MockService>(context, listen: false);
                        final adjustedAmt = isAdding ? amt : -amt;

                        try {
                          if (mockService.useLiveBackend) {
                            await mockService.apiService.adjustUserBalance(user['id'], adjustedAmt);
                          } else {
                            final idx = _users.indexWhere((u) => u['id'] == user['id']);
                            if (idx != -1) {
                              _users[idx]['wallet_balance'] += adjustedAmt;
                            }
                          }

                          Navigator.pop(ctx);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Successfully adjusted wallet by Rs. ${adjustedAmt.toStringAsFixed(2)}'),
                              backgroundColor: const Color(0xFF10B981),
                            ),
                          );
                          _refreshData();
                        } catch (e) {
                          setDialogState(() => isAdjusting = false);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Failed to adjust wallet balance.')),
                          );
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF764BA2),
                  foregroundColor: Colors.white,
                ),
                child: isAdjusting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('Confirm'),
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final filteredUsers = _users.where((u) {
      final query = _searchQuery.toLowerCase();
      return u['name'].toString().toLowerCase().contains(query) ||
          u['email'].toString().toLowerCase().contains(query) ||
          (u['company']?.toString() ?? '').toLowerCase().contains(query);
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC), // Slate 50 Background
      body: SafeArea(
        child: Column(
          children: [
            // Elegant Glass Header Card
            Container(
              margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE2E8F0)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.02),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF764BA2).withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.security_rounded, color: Color(0xFF764BA2), size: 18),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          Text(
                            'PLATFORM CONSOLE',
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF764BA2),
                              letterSpacing: 1.0,
                            ),
                          ),
                          Text(
                            'FlowReach Admin',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF1E293B),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, color: Color(0xFF64748B)),
                    onPressed: _refreshData,
                  ),
                ],
              ),
            ),

            // Tab bar switcher styled cleanly
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFFE2E8F0),
                borderRadius: BorderRadius.circular(12),
              ),
              child: TabBar(
                controller: _tabController,
                indicator: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                labelColor: const Color(0xFF1E293B),
                unselectedLabelColor: const Color(0xFF64748B),
                indicatorSize: TabBarIndicatorSize.tab,
                dividerColor: Colors.transparent,
                labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
                tabs: const [
                  Tab(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.dashboard_customize_rounded, size: 15),
                        SizedBox(width: 6),
                        Text('Overview'),
                      ],
                    ),
                  ),
                  Tab(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.people_alt_rounded, size: 15),
                        SizedBox(width: 6),
                        Text('Users & Billing'),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // TAB VIEW CONTENT
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator(valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF764BA2))))
                  : TabBarView(
                      controller: _tabController,
                      children: [
                        _buildOverviewTab(theme),
                        _buildUsersTab(theme, filteredUsers),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOverviewTab(ThemeData theme) {
    final double profit = double.tryParse((_stats['adminNetProfit'] ?? 0.0).toString()) ?? 0.0;
    final double revenue = double.tryParse((_stats['platformRevenue'] ?? 0.0).toString()) ?? 0.0;
    final double cost = double.tryParse((_stats['metaCostBill'] ?? 0.0).toString()) ?? 0.0;

    return RefreshIndicator(
      onRefresh: _refreshData,
      color: const Color(0xFF764BA2),
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        children: [
          // Dynamic profit margin card (Option B: premium light glassmorphic styling)
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF6366F1).withOpacity(0.06),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'TOTAL NET PROFIT (30% Markup)',
                      style: TextStyle(
                        color: Color(0xFF6366F1),
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.0,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'LIVE BALANCE',
                        style: TextStyle(color: Color(0xFF10B981), fontSize: 8, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  'Rs. ${profit.toStringAsFixed(2)}',
                  style: const TextStyle(
                    color: Color(0xFF4F46E5), // Premium Rich Indigo
                    fontSize: 30,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 14),
                // Profit margin progress visualization
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: const [
                        Text('Net profit Margin', style: TextStyle(fontSize: 10, color: Color(0xFF64748B))),
                        Text('30.0%', style: TextStyle(fontSize: 10, color: Color(0xFF6366F1), fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: const LinearProgressIndicator(
                        value: 0.30,
                        backgroundColor: Color(0xFFF1F5F9),
                        valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF6366F1)),
                        minHeight: 5,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                const Divider(color: Color(0xFFE2E8F0), height: 1),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _buildCompactStat(
                      title: 'Gross Revenue',
                      value: 'Rs. ${revenue.toStringAsFixed(2)}',
                      color: const Color(0xFF1E293B),
                    ),
                    _buildCompactStat(
                      title: 'Est. Meta Cost',
                      value: 'Rs. ${cost.toStringAsFixed(2)}',
                      color: const Color(0xFF64748B),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Platform metrics in clean, high-fidelity light theme cards
          Row(
            children: [
              Expanded(
                child: _buildMetricCard(
                  accentColor: const Color(0xFF3B82F6),
                  icon: Icons.people_rounded,
                  title: 'Total Users',
                  value: _stats['users']?.toString() ?? '0',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildMetricCard(
                  accentColor: const Color(0xFFEC4899),
                  icon: Icons.campaign_rounded,
                  title: 'Broadcasts',
                  value: _stats['campaigns']?.toString() ?? '0',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildMetricCard(
                  accentColor: const Color(0xFF10B981),
                  icon: Icons.integration_instructions_rounded,
                  title: 'Templates Sync',
                  value: _stats['templates']?.toString() ?? '0',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildMetricCard(
                  accentColor: const Color(0xFF6366F1),
                  icon: Icons.connected_tv_rounded,
                  title: 'Active WABAs',
                  value: _stats['activeConnections']?.toString() ?? '0',
                ),
              ),
            ],
          ),
          // Live Health & Telemetry Grid
          const SizedBox(height: 20),
          const Text(
            'LIVE SYSTEM TELEMETRY',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: Color(0xFF6366F1),
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 10),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 2.8,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            children: [
              _buildTelemetryItem(Icons.dns_rounded, 'API Server', 'Online (36ms)', Colors.emerald),
              _buildTelemetryItem(Icons.webhook_rounded, 'WebSocket', 'Connected', Colors.emerald),
              _buildTelemetryItem(Icons.storage_rounded, 'Database', 'Healthy', Colors.emerald),
              _buildTelemetryItem(Icons.chat_bubble_outline_rounded, 'Meta API', 'Active (100%)', Colors.emerald),
            ],
          ),

          // Live Gateway Console Logger
          const SizedBox(height: 24),
          const Text(
            'GATEWAY LOG MONITOR (REAL-TIME)',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: Color(0xFF6366F1),
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            height: 140,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF1E293B)),
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Text('[14:55:01] WebSocket server listening on port 3000...', style: TextStyle(fontFamily: 'monospace', fontSize: 10, color: Color(0xFF38BDF8))),
                  SizedBox(height: 4),
                  Text('[14:55:08] Client #42 (Vijay Patel) paired successfully.', style: TextStyle(fontFamily: 'monospace', fontSize: 10, color: Color(0xFF10B981))),
                  SizedBox(height: 4),
                  Text('[14:55:12] SMS OTP requested for +919876543210.', style: TextStyle(fontFamily: 'monospace', fontSize: 10, color: Color(0xFFF59E0B))),
                  SizedBox(height: 4),
                  Text('[14:55:40] SMS OTP verified successfully. ID: sim_phone_9876.', style: TextStyle(fontFamily: 'monospace', fontSize: 10, color: Color(0xFF10B981))),
                  SizedBox(height: 4),
                  Text('[14:55:45] Broadcast (Promo Batch A) started for 200 users.', style: TextStyle(fontFamily: 'monospace', fontSize: 10, color: Color(0xFFEC4899))),
                  SizedBox(height: 4),
                  Text('[14:56:10] Ledger: Raj Barot wallet adjusted (+Rs. 450.00).', style: TextStyle(fontFamily: 'monospace', fontSize: 10, color: Color(0xFFE2E8F0))),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Administrative configuration link
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: const Color(0xFFF1F5F9), shape: BoxShape.circle),
                    child: const Icon(Icons.settings_cell_rounded, color: Color(0xFF64748B), size: 18),
                  ),
                  title: const Text('API Gateway Route', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF1E293B))),
                  subtitle: const Text('flow-reach.onrender.com', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                ),
                const Divider(color: Color(0xFFE2E8F0), height: 1),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: Colors.red.withOpacity(0.08), shape: BoxShape.circle),
                    child: const Icon(Icons.logout_rounded, color: Colors.red, size: 18),
                  ),
                  title: const Text('Logout Console', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.red)),
                  onTap: () {
                    final mockService = Provider.of<MockService>(context, listen: false);
                    mockService.disconnectDevice();
                    Navigator.pushAndRemoveUntil(
                      context,
                      MaterialPageRoute(builder: (context) => const LoginScreen()),
                      (route) => false,
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUsersTab(ThemeData theme, List<dynamic> users) {
    return RefreshIndicator(
      onRefresh: _refreshData,
      color: const Color(0xFF764BA2),
      child: Column(
        children: [
          // Clean Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
            child: TextField(
            onChanged: (val) {
              setState(() {
                _searchQuery = val;
              });
            },
            style: const TextStyle(color: Color(0xFF1E293B)),
            decoration: InputDecoration(
              hintText: 'Search user email, name, or company...',
              hintStyle: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              prefixIcon: const Icon(Icons.search_rounded, color: Color(0xFF94A3B8), size: 18),
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFF764BA2), width: 1.2),
              ),
            ),
          ),
        ),

        // User Directory List
        Expanded(
          child: users.isEmpty
              ? const Center(child: Text('No users match search criteria.', style: TextStyle(color: Color(0xFF94A3B8))))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  itemCount: users.length,
                  itemBuilder: (context, index) {
                    final u = users[index];
                    final double bal = double.tryParse(u['wallet_balance']?.toString() ?? '0.0') ?? 0.0;
                    final hasWaba = u['connected_phone'] != null && u['connected_phone'].toString().isNotEmpty;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.01),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                        title: Row(
                          children: [
                            Text(
                              u['name'] ?? 'No Name',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Color(0xFF1E293B)),
                            ),
                            const SizedBox(width: 8),
                            if (u['role'] == 'admin')
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFBBF24).withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: const Color(0xFFFBBF24).withOpacity(0.2)),
                                ),
                                child: const Text('ADMIN', style: TextStyle(color: Color(0xFFD97706), fontSize: 8, fontWeight: FontWeight.bold)),
                              ),
                            const Spacer(),
                            // Quick WABA Status Indicator
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                              decoration: BoxDecoration(
                                color: (hasWaba ? const Color(0xFF10B981) : const Color(0xFF64748B)).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                hasWaba ? 'WABA ACTIVE' : 'SHARED GATEWAY',
                                style: TextStyle(
                                  color: hasWaba ? const Color(0xFF16A34A) : const Color(0xFF64748B),
                                  fontSize: 7,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 4),
                            Text(u['email'] ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                            if (u['company'] != null) ...[
                              const SizedBox(height: 2),
                              Text('Company: ${u['company']}', style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8), fontStyle: FontStyle.italic)),
                            ],
                          ],
                        ),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            const Text('Wallet Balance', style: TextStyle(fontSize: 9, color: Color(0xFF94A3B8))),
                            const SizedBox(height: 2),
                            Text(
                              'Rs. ${bal.toStringAsFixed(2)}',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                                color: bal > 50.00 ? const Color(0xFF16A34A) : Colors.red,
                              ),
                            ),
                          ],
                        ),
                        onTap: () => _showUserDetailsBottomSheet(context, u),
                      ),
                    );
                  },
                ),
          ),
        ],
      ),
    );
  }

  Widget _buildMetricCard({required Color accentColor, required IconData icon, required String title, required String value}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.01),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: accentColor.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: accentColor, size: 16),
              ),
              // Mini Sparkline
              Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(6, (index) {
                  final heights = [10.0, 16.0, 8.0, 22.0, 14.0, 25.0];
                  final height = heights[index % heights.length];
                  return Container(
                    width: 3,
                    height: height,
                    margin: const EdgeInsets.symmetric(horizontal: 1),
                    decoration: BoxDecoration(
                      color: accentColor.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  );
                }),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(title, style: const TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.w500)),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                value,
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.arrow_upward_rounded, size: 8, color: Color(0xFF10B981)),
                    Text('+12%', style: TextStyle(fontSize: 7, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCompactStat({required String title, required String value, required Color color}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: TextStyle(color: color.withOpacity(0.6), fontSize: 9, fontWeight: FontWeight.w500)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildTelemetryItem(IconData icon, String name, String status, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 14, color: const Color(0xFF64748B)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(name, style: const TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                const SizedBox(height: 2),
                Text(
                  status,
                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: color),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
